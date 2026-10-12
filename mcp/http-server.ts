import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { join, resolve } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AgentOSAdapter, localBaseUrl } from "./adapter";
import { MissionVault } from "./vault";
import { createMcpServer } from "./tools";
import { historyPage } from "./history";

const key = process.env.MCP_ACCESS_KEY ?? "";
if (!/^[a-f0-9]{64}$/.test(key))
  throw new Error(
    "Set MCP_ACCESS_KEY to 32 random bytes encoded as 64 hex characters.",
  );
const root = resolve(__dirname, "../..");
const origin = localBaseUrl(
  process.env.AGENTOS_BASE_URL ?? "http://127.0.0.1:3000",
);
function requiredPublicOrigin(value: string | undefined) {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error("MCP_PUBLIC_ORIGIN must be a clean HTTPS origin.");
  }
}
const publicOrigin = requiredPublicOrigin(process.env.MCP_PUBLIC_ORIGIN);
const historyUrl = `${publicOrigin}/mcp/${key}/history`;
const remoteDashboard = {
  dashboardUrl: historyUrl,
  dashboardLabel: "Live payment history",
  transactionHistoryUrl: historyUrl,
};
class RemoteAdapter extends AgentOSAdapter {
  override async create(input: Parameters<AgentOSAdapter["create"]>[0]) {
    return {
      ...(await super.create(input)),
      ...remoteDashboard,
    };
  }
  override async wait(...args: Parameters<AgentOSAdapter["wait"]>) {
    return {
      ...(await super.wait(...args)),
      ...remoteDashboard,
    };
  }
  override async status(...args: Parameters<AgentOSAdapter["status"]>) {
    return { ...(await super.status(...args)), ...remoteDashboard };
  }
  override pdfDescriptor(id: string) {
    return {
      ...super.pdfDescriptor(id),
      downloadUrl: `${publicOrigin}/mcp/${key}/reports/${id}`,
    };
  }
}
const adapter = new RemoteAdapter(
  origin,
  new MissionVault(join(root, ".agentos", "mcp")),
  Number(process.env.AGENTOS_MCP_MAX_BUDGET ?? "5"),
);
const http = createServer(async (req, res) => {
  let path: string;
  try {
    path = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    res.writeHead(400);
    res.end("Invalid request path");
    return;
  }
  if (path === "/healthz") {
    res.writeHead(200);
    res.end("ready");
    return;
  }
  if (path === "/readyz") {
    let ready = false;
    try {
      const response = await fetch(`${origin}/api/health`, {
        redirect: "error",
        signal: AbortSignal.timeout(4000),
      });
      const health = response.ok ? await response.json() : null;
      ready = ["READY", "DEVELOPMENT READY"].includes(health?.status);
    } catch {
      // Only readiness is public; upstream diagnostics may contain private data.
    }
    res.writeHead(ready ? 200 : 503, { "Cache-Control": "no-store" });
    res.end(ready ? "ready" : "Backend unavailable");
    return;
  }
  const supplied = path.split("/")[2] ?? "";
  const valid =
    /^[a-f0-9]{64}$/.test(supplied) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(key));
  if (
    !valid ||
    !/^\/mcp\/[a-f0-9]{64}(?:\/reports\/[a-f0-9-]{36}|\/history(?:\/data)?)?$/.test(
      path,
    )
  ) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  if (req.headers.origin && req.headers.origin !== publicOrigin) {
    res.writeHead(403);
    res.end("Origin denied");
    return;
  }
  if (path.endsWith("/history") || path.endsWith("/history/data")) {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const data = path.endsWith("/data");
      res.writeHead(200, {
        "Content-Type": data ? "application/json" : "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(data ? JSON.stringify(await adapter.history()) : historyPage);
    } catch {
      if (!res.headersSent) res.writeHead(503);
      res.end();
    }
    return;
  }
  if (path.includes("/reports/")) {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const id = path.split("/")[4];
      const pdf = await adapter.reportPdf(id);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="agentos-${id}.pdf"`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(pdf);
    } catch {
      res.writeHead(404);
      res.end("Report unavailable");
    }
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
http.listen(
  Number(process.env.MCP_HTTP_PORT ?? "3333"),
  process.env.MCP_BIND_ADDRESS ?? "127.0.0.1",
  () =>
    console.error("AgentOS HTTP MCP listening; private access URL required."),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => http.close(() => process.exit(0)));
