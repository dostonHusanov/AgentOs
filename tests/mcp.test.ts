import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  cpSync,
  mkdirSync,
  symlinkSync,
  statSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  AgentOSAdapter,
  localBaseUrl,
  createInputSchema,
} from "../mcp/adapter";
import { MissionVault } from "../mcp/vault";
import { browserCredential } from "../mcp/browser-access";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function temporary() {
  return mkdtempSync(join(tmpdir(), "agentos-mcp-test-"));
}
function data(result: unknown) {
  const r = result as CallToolResult;
  assert.equal(r.isError, undefined, JSON.stringify(r.content));
  return JSON.parse((r.content[0] as { text: string }).text);
}

test("MCP validates budgets, constraints and fixed loopback origins", () => {
  const schema = createInputSchema(5);
  for (const maxBudget of [
    undefined,
    0,
    -1,
    NaN,
    Infinity,
    5.01,
    0.1000001,
    "5",
  ])
    assert.equal(
      schema.safeParse({
        goal: "Research a practical business opportunity",
        maxBudget,
      }).success,
      false,
    );
  assert.equal(schema.safeParse({ maxBudget: 5 }).success, false);
  assert.equal(
    schema.safeParse({ goal: "short", maxBudget: 5 }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      goal: "x".repeat(6000),
      constraints: ["extra"],
      maxBudget: 5,
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      goal: "Research a practical business opportunity",
      maxBudget: 5,
      policy: { escrowThreshold: 1000 },
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      goal: "Research a practical business opportunity",
      maxBudget: 0.123456,
    }).success,
    true,
  );
  for (const url of [
    "https://example.com",
    "http://169.254.169.254",
    "http://evil.local",
    "http://user:secret@localhost:3001",
    "http://localhost:3001/private",
    "http://localhost:3001?token=secret",
  ])
    assert.throws(() => localBaseUrl(url));
  assert.equal(localBaseUrl("http://127.0.0.1:3001/"), "http://127.0.0.1:3001");
});

test("MCP stdio handshake, tools, safe asynchronous API adapter and durable credentials", async () => {
  const root = temporary();
  const id = randomUUID();
  const secret = "ab".repeat(32);
  const privateSentinel = "PRIVATE_PROOF_SHOULD_NEVER_APPEAR";
  let state = "planning";
  let creates = 0,
    starts = 0,
    reads = 0;
  let creation: Record<string, unknown> = {};
  const http = createServer(async (req, res) => {
    const send = (value: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/missions" && req.method === "POST") {
      creates++;
      let body = "";
      for await (const chunk of req) body += chunk;
      creation = JSON.parse(body);
      return send({ id, status: "created", accessToken: secret }, 201);
    }
    if (req.headers.authorization !== `Bearer ${secret}`)
      return send({ error: privateSentinel }, 401);
    if (req.url === `/api/missions/${id}/report` && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end(Buffer.from("%PDF-1.4\n% mock transport fixture\n%%EOF"));
    }
    if (req.url === `/api/missions/${id}/start` && req.method === "POST") {
      starts++;
      return send({ id, status: "created" }, 202);
    }
    if (req.url === `/api/missions/${id}` && req.method === "GET") {
      reads++;
      return send({
        id,
        status: state,
        goal: creation.goal,
        accessToken: secret,
        arbitrarySecret: privateSentinel,
        budget: {
          initial: 5,
          spent: 1.2,
          reserved: 0,
          remaining: 3.8,
          asset: "tUSDM",
          password: privateSentinel,
        },
        jobs: [
          {
            id: "j1",
            sellerAgentId: "research",
            sellerName: "ResearchPro",
            capability: "web_research",
            status: "completed",
            registrySource: "masumi",
            signingKey: privateSentinel,
            result: {
              sources: [
                {
                  title: "Primary source",
                  url: "https://example.org/research",
                  secret: privateSentinel,
                },
              ],
              privateKey: secret,
            },
          },
          {
            id: "j2",
            sellerAgentId: "data",
            sellerName: "DataHub",
            parentJobId: "j1",
            capability: "structured_city_data",
            status: "completed",
            registrySource: "masumi",
          },
        ],
        events: [
          {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            type: "verification_passed",
            jobId: "j1",
            message: "Existing verifier passed",
            createdAt: "2026-10-07T00:00:00Z",
            internalToken: secret,
          },
        ],
        payments: [
          {
            id: "p1",
            jobId: "j1",
            buyerAgentId: "manager",
            sellerAgentId: "research",
            amount: 1,
            asset: "tUSDM",
            mode: "cardano",
            network: "preprod",
            status: "confirmed",
            txHash: "cd".repeat(32),
            proofDigest: privateSentinel,
            accessToken: secret,
            escrow: {
              state: "result_submitted",
              nonce: privateSentinel,
              inputHash: privateSentinel,
              quote: { apiKey: secret },
            },
          },
        ],
        result: {
          title: "Business report",
          recommendation: "Evaluate the options",
          comparison: [
            { option: "A", assessment: "Promising", secret: privateSentinel },
          ],
          evidence: ["Source-backed finding"],
          limitations: ["Validate independently"],
          apiKey: secret,
        },
      });
    }
    return send({ error: privateSentinel }, 404);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  mkdirSync(join(root, "dist"));
  cpSync(resolve("dist/mcp"), join(root, "dist/mcp"), { recursive: true });
  cpSync(resolve("dist/lib"), join(root, "dist/lib"), { recursive: true });
  symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
  const connect = async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(root, "dist/mcp/server.js")],
      cwd: tmpdir(),
      env: { AGENTOS_BASE_URL: base },
      stderr: "pipe",
    });
    const client = new Client({ name: "agentos-safe-test", version: "1.0.0" });
    await client.connect(transport);
    return client;
  };
  let client: Client | undefined;
  try {
    client = await connect();
    assert.equal(client.getServerVersion()?.name, "agentos");
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((t) => t.name).sort(), [
      "agentos_create_mission",
      "agentos_get_mission",
      "agentos_get_receipts",
      "agentos_get_result",
      "agentos_wait_for_mission",
    ]);
    const create = listed.tools.find(
      (t) => t.name === "agentos_create_mission",
    )!;
    assert.equal(create.inputSchema.type, "object");
    assert.deepEqual(create.inputSchema.required?.sort(), [
      "goal",
      "maxBudget",
    ]);
    assert.equal(
      (create.inputSchema.properties?.maxBudget as { maximum: number }).maximum,
      5,
    );
    for (const args of [
      { goal: "Research a practical business opportunity", maxBudget: -1 },
      { goal: "Research a practical business opportunity", maxBudget: 6 },
      { maxBudget: 5 },
    ]) {
      const r = (await client.callTool({
        name: "agentos_create_mission",
        arguments: args,
      })) as CallToolResult;
      assert.equal(r.isError, true);
    }
    assert.equal(creates, 0, "Validation must happen before HTTP creation");
    const unknown = (await client.callTool({
      name: "agentos_get_mission",
      arguments: { missionId: randomUUID() },
    })) as CallToolResult;
    assert.equal(unknown.isError, true);
    assert.equal(reads, 0, "Unowned mission must never be queried");
    const created = data(
      await client.callTool({
        name: "agentos_create_mission",
        arguments: {
          goal: "Research a practical business opportunity",
          maxBudget: 5,
          constraints: ["Use current source evidence"],
        },
      }),
    );
    assert.equal(created.missionId, id);
    assert.equal(created.status, "accepted");
    assert.equal(created.maxBudget, 5);
    assert.equal(creates, 1);
    assert.equal(starts, 1);
    assert.deepEqual(creation, {
      goal: "Research a practical business opportunity\n\nUser constraints:\n- Use current source evidence",
      budget: 5,
      asset: "tUSDM",
    });
    assert.equal("policy" in creation, false);
    const progressMessages: string[] = [];
    const waited = data(
      await client.callTool(
        {
          name: "agentos_wait_for_mission",
          arguments: { missionId: id, waitSeconds: 1 },
        },
        undefined,
        {
          onprogress: (p) => {
            if (p.message) progressMessages.push(p.message);
          },
        },
      ),
    );
    assert.equal(waited.finished, false);
    assert.equal(waited.status, "planning");
    assert.equal(waited.logs.length, 1);
    assert.equal(waited.lastEventId, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    assert.match(waited.nextAction, /SAME missionId/);
    assert.ok(
      progressMessages.length > 0,
      "Client receives actual MCP progress notifications",
    );
    assert.ok(progressMessages.some((s) => s.includes("planning")));
    assert.ok(!JSON.stringify(waited).includes(secret));
    assert.ok(!progressMessages.join(" ").includes(privateSentinel));
    assert.equal(creates, 1);
    assert.equal(
      starts,
      1,
      "Waiting cannot trigger another execution or purchase",
    );
    assert.equal(statSync(join(root, ".agentos/mcp")).mode & 0o777, 0o700);
    assert.equal(
      statSync(join(root, `.agentos/mcp/${id}.json`)).mode & 0o777,
      0o600,
    );
    const pending = data(
      await client.callTool({
        name: "agentos_get_result",
        arguments: { missionId: id },
      }),
    );
    assert.equal(pending.result, null);
    state = "failed";
    const failed = data(
      await client.callTool({
        name: "agentos_get_result",
        arguments: { missionId: id },
      }),
    );
    assert.match(failed.result.title, /Partial report/);
    state = "completed";
    const completeWait = data(
      await client.callTool({
        name: "agentos_wait_for_mission",
        arguments: {
          missionId: id,
          waitSeconds: 1,
          afterEventId: waited.lastEventId,
        },
      }),
    );
    assert.equal(completeWait.finished, true);
    assert.equal(completeWait.pdf.available, true);
    assert.equal(
      completeWait.pdf.downloadUrl,
      `${base}/mcp/mission/${id}/report`,
    );
    assert.equal(
      completeWait.logs.length,
      0,
      "Previously returned logs are not repeated",
    );
    assert.equal(completeWait.report.result.title, "Business report");
    assert.equal(completeWait.receipts.receipts.length, 1);
    assert.ok(!JSON.stringify(completeWait).includes(privateSentinel));
    const resources = await client.listResourceTemplates();
    assert.equal(
      resources.resourceTemplates[0].uriTemplate,
      "agentos://missions/{missionId}/report.pdf",
    );
    const pdfResource = await client.readResource({
      uri: completeWait.pdf.uri,
    });
    const pdfBody = pdfResource.contents[0] as {
      blob: string;
      mimeType: string;
    };
    assert.equal(pdfBody.mimeType, "application/pdf");
    assert.ok(
      Buffer.from(pdfBody.blob, "base64").toString().startsWith("%PDF-"),
    );
    for (const name of [
      "agentos_get_mission",
      "agentos_get_result",
      "agentos_get_receipts",
    ]) {
      const response = await client.callTool({
        name,
        arguments: { missionId: id },
      });
      const encoded = JSON.stringify(response);
      assert.ok(!encoded.includes(secret));
      assert.ok(!encoded.includes(privateSentinel));
      assert.ok(!encoded.includes("proofDigest"));
      assert.ok(!encoded.includes("accessToken"));
      const value = data(response);
      if (name === "agentos_get_mission") {
        assert.equal(value.nestedHires, 1);
        assert.equal(value.agentsUsed[1].parentJobId, "j1");
      }
      if (name === "agentos_get_result") {
        assert.equal(value.result.title, "Business report");
        assert.equal(value.sources[0].url, "https://example.org/research");
      }
      if (name === "agentos_get_receipts") {
        assert.equal(value.receipts[0].transactionHash, "cd".repeat(32));
        assert.equal(value.receipts[0].escrow.state, "result_submitted");
      }
    }
    await client.close();
    client = await connect();
    assert.equal(
      data(
        await client.callTool({
          name: "agentos_get_mission",
          arguments: { missionId: id },
        }),
      ).status,
      "completed",
    );
    assert.equal(creates, 1, "Reconnect must not recreate or restart missions");
    assert.equal(starts, 1);
  } finally {
    await client?.close();
    await new Promise<void>((r) => http.close(() => r()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("ambiguous start retains mission ID without retry; unsafe upstream errors stay private", async () => {
  const root = temporary();
  const id = randomUUID();
  let starts = 0;
  const vault = new MissionVault(root);
  const http = (async (url: string | URL | Request) => {
    if (String(url).endsWith("/start")) {
      starts++;
      throw new Error("API_KEY_NEVER_EXPOSE");
    }
    return Response.json({
      id,
      status: "created",
      accessToken: "ab".repeat(32),
    });
  }) as typeof fetch;
  try {
    const adapter = new AgentOSAdapter("http://127.0.0.1:3001", vault, 5, http);
    const result = await adapter.create({
      goal: "Research a practical business opportunity",
      maxBudget: 5,
    });
    assert.equal(result.status, "start_uncertain");
    assert.equal(result.missionId, id);
    assert.equal(starts, 1);
    assert.ok(!JSON.stringify(result).includes("API_KEY_NEVER_EXPOSE"));
    const bad = new AgentOSAdapter(
      "http://127.0.0.1:3001",
      vault,
      5,
      (async () =>
        Response.json(
          { error: "PRIVATE_KEY_NEVER_EXPOSE" },
          { status: 500 },
        )) as typeof fetch,
    );
    await assert.rejects(
      bad.status(id),
      /^Error: AgentOS rejected the request \(HTTP 500\)\.$/,
    );
    assert.equal(
      JSON.parse(readFileSync(join(root, `${id}.json`), "utf8")).missionId,
      id,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cancelling a wait stops monitoring without any mutation or replacement", async () => {
  const root = temporary();
  const id = randomUUID();
  const vault = new MissionVault(root);
  const controller = new AbortController();
  const requests: string[] = [];
  vault.put({
    missionId: id,
    accessToken: "ab".repeat(32),
    baseUrl: "http://127.0.0.1:3001",
  });
  const http = (async (_url: unknown, init: RequestInit) => {
    requests.push(init.method!);
    return Response.json({
      id,
      status: "executing",
      goal: "Existing mission",
      budget: {
        initial: 5,
        spent: 1,
        reserved: 0,
        remaining: 4,
        asset: "tUSDM",
      },
      jobs: [],
      events: [],
      payments: [],
    });
  }) as typeof fetch;
  try {
    const adapter = new AgentOSAdapter("http://127.0.0.1:3001", vault, 5, http);
    await assert.rejects(
      adapter.wait(id, 25, undefined, controller.signal, async () => {
        controller.abort();
      }),
      /mission continues/,
    );
    assert.deepEqual(
      requests,
      ["GET"],
      "Only a read occurred; cancellation cannot start, cancel or replace a mission",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local MCP dashboard checks origin, ownership and browser fetch metadata", () => {
  const root = temporary();
  const id = randomUUID();
  const vault = new MissionVault(root);
  try {
    vault.put({
      missionId: id,
      accessToken: "ab".repeat(32),
      baseUrl: "http://127.0.0.1:3001",
    });
    const request = (host: string, site?: string, origin?: string) =>
      new Request(`${host}/api/mcp/missions/${id}`, {
        headers: {
          ...(site ? { "sec-fetch-site": site } : {}),
          ...(origin ? { origin } : {}),
        },
      });
    assert.equal(
      browserCredential(
        request("http://127.0.0.1:3001", "same-origin"),
        id,
        vault,
      ).missionId,
      id,
    );
    for (const r of [
      request("http://127.0.0.1:3001"),
      request("http://127.0.0.1:3001", "cross-site"),
      request(
        "http://127.0.0.1:3001",
        "same-origin",
        "https://attacker.example",
      ),
      request("http://attacker.example:3001", "same-origin"),
      request("http://127.0.0.1:3002", "same-origin"),
    ])
      assert.throws(() => browserCredential(r, id, vault));
    assert.throws(() =>
      browserCredential(
        request("http://127.0.0.1:3001", "same-origin"),
        randomUUID(),
        vault,
      ),
    );
    assert.throws(() => vault.get("../../.env.local"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
