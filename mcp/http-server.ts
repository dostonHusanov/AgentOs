import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { join, resolve } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AgentOSAdapter, localBaseUrl } from "./adapter";
import { MissionVault } from "./vault";
import { createMcpServer } from "./tools";

const key = process.env.MCP_ACCESS_KEY ?? "";
if (!/^[a-f0-9]{64}$/.test(key))
  throw new Error(
    "Set MCP_ACCESS_KEY to 32 random bytes encoded as 64 hex characters.",
  );
const root = resolve(__dirname, "../..");
const origin = localBaseUrl(
  process.env.AGENTOS_BASE_URL ?? "http://127.0.0.1:3000",
);
const publicOrigin = process.env.MCP_PUBLIC_ORIGIN;
if (publicOrigin && new URL(publicOrigin).protocol !== "https:")
  throw new Error("MCP_PUBLIC_ORIGIN must use HTTPS.");
const adapter = new AgentOSAdapter(
  origin,
  new MissionVault(join(root, ".agentos", "mcp")),
  Number(process.env.AGENTOS_MCP_MAX_BUDGET ?? "5"),
);
const http = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path === "/healthz") {
    res.writeHead(200);
    res.end("ready");
    return;
  }
  const supplied = path.split("/")[2] ?? "";
  const valid =
    supplied.length === key.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(key));
  if (!valid || !/^\/mcp\/[a-f0-9]{64}$/.test(path)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  if (req.headers.origin && req.headers.origin !== publicOrigin) {
    res.writeHead(403);
    res.end("Origin denied");
    return;
  }
  if (!["POST", "GET", "DELETE"].includes(req.method ?? "")) {
    res.writeHead(405);
    res.end();
    return;
  }
  // One private invited workspace. The URL key is the access credential.
  // Each request gets an independent protocol server; durable mission ownership
  // stays in the shared private vault across transport reconnections.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = createMcpServer(adapter);
  let done = false;
  res.on("close", () => {
    if (!done) {
      done = true;
      void server.close();
    }
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end("MCP request failed");
    }
  }
});
http.requestTimeout = 0;
http.headersTimeout = 30000;
http.listen(Number(process.env.MCP_HTTP_PORT ?? "3333"), "0.0.0.0", () =>
  console.error("AgentOS HTTP MCP listening; private access URL required."),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => http.close(() => process.exit(0)));
