import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const fixtureKey = "12".repeat(32);
const publicOrigin = "https://agentos.example.test";

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "agentos-http-test-"));
  cpSync(resolve("dist"), join(root, "dist"), { recursive: true });
  symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
  return root;
}

async function freePort() {
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((done) => socket.close(() => done()));
  return port;
}

function launch(root: string, base: string, port: number, origin?: string) {
  return spawn(process.execPath, [join(root, "dist/mcp/http-server.js")], {
    cwd: root,
    // Deliberately do not inherit live environment variables or .env files.
    env: {
      NODE_ENV: "test",
      AGENTOS_BASE_URL: base,
      AGENTOS_MCP_MAX_BUDGET: "5",
      MCP_ACCESS_KEY: fixtureKey,
      MCP_BIND_ADDRESS: "127.0.0.1",
      MCP_HTTP_PORT: String(port),
      ...(origin === undefined ? {} : { MCP_PUBLIC_ORIGIN: origin }),
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
  await exited;
  clearTimeout(timer);
}

function value(result: unknown) {
  const response = result as CallToolResult;
  assert.equal(response.isError, undefined);
  return JSON.parse((response.content[0] as { text: string }).text);
}

test("HTTP MCP readiness, reconnects, authorization and hosted links use an isolated mock", async () => {
  const root = sandbox();
  const id = randomUUID();
  const token = "ab".repeat(32);
  let healthStatus = "READY";
  let creates = 0;
  let starts = 0;
  const backend = createServer((req, res) => {
    const send = (data: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.url === "/api/health") {
      if (healthStatus === "TIMEOUT") return;
      return send({ status: healthStatus, privateDetail: "DO_NOT_FORWARD" });
    }
    if (req.url === "/api/missions" && req.method === "POST") {
      creates++;
      return send({ id, status: "created", accessToken: token }, 201);
    }
    if (req.headers.authorization !== `Bearer ${token}`) return send({}, 401);
    if (req.url === `/api/missions/${id}/start` && req.method === "POST") {
      starts++;
      return send({ status: "accepted" }, 202);
    }
    if (req.url === `/api/missions/${id}/report`) {
      res.writeHead(200, { "Content-Type": "application/pdf" });
      res.end("%PDF-1.4\n%%EOF");
      return;
    }
    if (req.url === `/api/missions/${id}`)
      return send({
        id,
        goal: "Research an isolated fixture for HTTP transport testing",
        status: "completed",
        budget: {
          initial: 5,
          spent: 0,
          reserved: 0,
          remaining: 5,
          asset: "tUSDM",
        },
        jobs: [],
        payments: [],
        events: [],
        result: {
          title: "Fixture report",
          recommendation: "Testing only",
          comparison: [],
          evidence: [],
          limitations: [],
        },
      });
    return send({}, 404);
  });
  let child: ChildProcess | undefined;
  let client: Client | undefined;
  try {
    await new Promise<void>((done) => backend.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${(backend.address() as { port: number }).port}`;
    const port = await freePort();
    const local = `http://127.0.0.1:${port}`;
    const endpoint = `${local}/mcp/${fixtureKey}`;
    child = launch(root, base, port, `${publicOrigin}/`);
    for (let attempt = 0; ; attempt++) {
      try {
        assert.equal((await fetch(`${local}/healthz`)).status, 200);
        break;
      } catch {
        if (attempt >= 100) throw new Error("HTTP fixture failed to start");
        await pause(30);
      }
    }
    for (const [status, expected] of [
      ["READY", 200],
      ["DEVELOPMENT READY", 200],
      ["BLOCKED", 503],
      ["UNKNOWN", 503],
      ["TIMEOUT", 503],
    ] as const) {
      healthStatus = status;
      const response = await fetch(`${local}/readyz`);
      assert.equal(response.status, expected);
      assert.ok(!(await response.text()).includes("DO_NOT_FORWARD"));
    }
    assert.equal((await fetch(`${local}/healthz`)).status, 200);
    healthStatus = "READY";
    for (const key of ["34".repeat(32), "é".repeat(64), "short"])
      assert.equal((await fetch(`${local}/mcp/${key}`)).status, 404);
    assert.equal(
      (await fetch(endpoint, { headers: { Origin: "https://untrusted.test" } }))
        .status,
      403,
    );
    const connect = async () => {
      const connected = new Client({ name: "http-fixture", version: "1.0.0" });
      await connected.connect(
        new StreamableHTTPClientTransport(new URL(endpoint)),
      );
      return connected;
    };
    client = await connect();
    assert.equal((await client.listTools()).tools.length, 5);
    const created = value(
      await client.callTool({
        name: "agentos_create_mission",
        arguments: {
          goal: "Research an isolated fixture for HTTP transport testing",
          maxBudget: 5,
        },
      }),
    );
    const history = `${publicOrigin}/mcp/${fixtureKey}/history`;
    assert.equal(created.dashboardUrl, history);
    assert.equal(created.dashboardLabel, "Live payment history");
    assert.equal(created.transactionHistoryUrl, history);
    await client.close();
    client = await connect();
    for (const name of ["agentos_get_mission", "agentos_wait_for_mission"]) {
      const response = await client.callTool({
        name,
        arguments: { missionId: id },
      });
      const data = value(response);
      assert.equal(data.dashboardUrl, history);
      assert.ok(!JSON.stringify(response).includes(base));
      assert.ok(!JSON.stringify(response).includes(token));
      if (name === "agentos_wait_for_mission") {
        assert.equal(data.finished, true);
        assert.equal(
          data.pdf.downloadUrl,
          `${publicOrigin}/mcp/${fixtureKey}/reports/${id}`,
        );
      }
    }
    const receipts = await fetch(`${endpoint}/history/data`).then((r) =>
      r.json(),
    );
    assert.equal(receipts.missions[0].missionId, id);
    assert.equal(creates, 1);
    assert.equal(starts, 1);
    await new Promise<void>((done) => backend.close(() => done()));
    assert.equal((await fetch(`${local}/readyz`)).status, 503);
    assert.equal((await fetch(`${local}/healthz`)).status, 200);
  } finally {
    await client?.close();
    if (child) await stop(child);
    backend.closeAllConnections();
    await new Promise<void>((done) => backend.close(() => done()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("HTTP MCP requires a clean public HTTPS origin before listening", async () => {
  const root = sandbox();
  try {
    for (const origin of [
      undefined,
      "http://agentos.example.test",
      "https://user:password@agentos.example.test",
      "https://agentos.example.test/mcp",
      "https://agentos.example.test?query=value",
      "https://agentos.example.test#fragment",
      "invalid",
    ]) {
      const child = launch(root, "http://127.0.0.1:1", 0, origin);
      try {
        const code = await new Promise<number | null>((done, reject) => {
          child.once("error", reject);
          child.once("exit", done);
        });
        assert.equal(code, 1);
      } finally {
        await stop(child);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
