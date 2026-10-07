import assert from "node:assert/strict";
import { mkdtempSync, cpSync, symlinkSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

async function main() {
  const root = process.cwd();
  const sandbox = mkdtempSync(join(tmpdir(), "agentos-mcp-fixture-"));
  const portProbe = createServer();
  await new Promise<void>((r) => portProbe.listen(0, "127.0.0.1", r));
  const port = (portProbe.address() as { port: number }).port;
  await new Promise<void>((r) => portProbe.close(() => r()));
  const base = `http://127.0.0.1:${port}`;

  // Copy only source files. Never copy .env.local, wallets, receipts or live state.
  for (const item of [
    "app",
    "components",
    "lib",
    "types",
    "mcp",
    "public",
    "assets",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "package.json",
    "next-env.d.ts",
  ])
    cpSync(join(root, item), join(sandbox, item), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(sandbox, "node_modules"), "dir");
  mkdirSync(join(sandbox, "dist"));
  cpSync(join(root, "dist/mcp"), join(sandbox, "dist/mcp"), {
    recursive: true,
  });
  const web = spawn(
    process.execPath,
    [
      join(root, "node_modules/next/dist/bin/next"),
      "dev",
      sandbox,
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: sandbox,
      env: {
        PATH: process.env.PATH,
        PAYMENT_MODE: "simulation",
        AI_MODE: "fixture",
        APP_URL: base,
        NODE_ENV: "development",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  for (const stream of [web.stdout, web.stderr])
    stream?.on("data", (chunk) => {
      log = (log + String(chunk)).slice(-6000);
    });
  const client = new Client({
    name: "agentos-fixture-smoke",
    version: "1.0.0",
  });
  function toolData(value: unknown) {
    const result = value as CallToolResult;
    assert.ok(!result.isError, JSON.stringify(result.content));
    return JSON.parse((result.content[0] as { text: string }).text);
  }
  try {
    let healthy = false;
    for (let tick = 0; tick < 90; tick++) {
      if (web.exitCode !== null) throw new Error("Isolated web server stopped");
      try {
        const health = await (
          await fetch(`${base}/api/health`, {
            signal: AbortSignal.timeout(3000),
          })
        ).json();
        assert.equal(health.paymentMode, "simulation", "Refuse real payments");
        assert.equal(health.aiMode, "fixture", "Refuse paid AI");
        healthy = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    assert.ok(healthy, "Isolated fixture web server did not become ready");
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [join(sandbox, "dist/mcp/server.js")],
        cwd: tmpdir(),
        env: { AGENTOS_BASE_URL: base },
        stderr: "pipe",
      }),
    );
    assert.equal((await client.listTools()).tools.length, 5);
    const created = toolData(
      await client.callTool({
        name: "agentos_create_mission",
        arguments: {
          goal: "Research the best city in Southeast Asia for a remote software developer to live for one month. Compare cost of living, internet quality, safety, and coworking options, then recommend a city.",
          maxBudget: 5,
        },
      }),
    );
    let status;
    for (let tick = 0; tick < 120; tick++) {
      status = toolData(
        await client.callTool({
          name: "agentos_wait_for_mission",
          arguments: { missionId: created.missionId, waitSeconds: 5 },
        }),
      );
      if (["completed", "failed"].includes(status.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.equal(status.status, "completed", JSON.stringify(status));
    assert.ok(status.nestedHires > 0);
    assert.equal(status.spent, 1.7);
    assert.equal(
      status.pdf.available,
      true,
      "Completed wait automatically delivers a PDF",
    );
    const pdfResource = await client.readResource({ uri: status.pdf.uri });
    assert.equal(pdfResource.contents[0].mimeType, "application/pdf");
    const report = toolData(
      await client.callTool({
        name: "agentos_get_result",
        arguments: { missionId: created.missionId },
      }),
    );
    assert.ok(report.result.recommendation);
    const receipts = toolData(
      await client.callTool({
        name: "agentos_get_receipts",
        arguments: { missionId: created.missionId },
      }),
    );
    assert.equal(receipts.receipts.length, 3);
    assert.ok(
      receipts.receipts.every(
        (r: { paymentMode: string; transactionHash: unknown }) =>
          r.paymentMode === "simulation" && r.transactionHash === null,
      ),
    );
    const browser = await fetch(
      `${base}/api/mcp/missions/${created.missionId}`,
      {
        headers: { "sec-fetch-site": "same-origin" },
      },
    );
    assert.equal(browser.status, 200);
    const snapshot = await browser.json();
    assert.equal(snapshot.id, created.missionId);
    assert.equal(snapshot.status, "completed");
    assert.ok(!JSON.stringify(snapshot).includes("accessToken"));
    assert.ok(!JSON.stringify(snapshot).includes("proofDigest"));
    assert.equal(
      (await fetch(`${base}/api/mcp/missions/${created.missionId}`)).status,
      403,
    );
    assert.equal((await fetch(created.dashboardUrl)).status, 200);
    const pdfDownload = await fetch(
      `${base}/api/mcp/missions/${created.missionId}/report`,
      { headers: { "sec-fetch-site": "same-origin" } },
    );
    assert.equal(pdfDownload.status, 200);
    assert.equal(pdfDownload.headers.get("content-type"), "application/pdf");
    assert.ok(
      Buffer.from(await pdfDownload.arrayBuffer())
        .subarray(0, 5)
        .toString() === "%PDF-",
    );
    assert.equal(
      (await fetch(`${base}/api/missions/${created.missionId}/report`)).status,
      401,
      "PDF route must require the existing token",
    );
    console.log(
      "MCP SAFE SMOKE PASSED: real existing mission engine, 3 simulated receipts, nested hire, result and dashboard verified. No Cardano funds or AI credits used; live configuration untouched.",
    );
  } catch (error) {
    console.error(log);
    throw error;
  } finally {
    await client.close();
    if (web.exitCode === null) {
      const exited = once(web, "exit");
      web.kill("SIGTERM");
      const force = setTimeout(() => web.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(force);
    }
    rmSync(sandbox, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "MCP smoke test failed",
  );
  process.exitCode = 1;
});
