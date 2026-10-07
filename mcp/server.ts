import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve, join } from "node:path";
import { AgentOSAdapter, localBaseUrl } from "./adapter";
import { MissionVault } from "./vault";
import { createMcpServer } from "./tools";

// This standalone process never loads .env.local or the mission executor.
// Secrets and normal application logging stay in the existing web server.
async function main() {
  const root = resolve(__dirname, "../..");
  const origin = localBaseUrl(
    process.env.AGENTOS_BASE_URL ?? "http://127.0.0.1:3001",
  );
  const cap = Number(process.env.AGENTOS_MCP_MAX_BUDGET ?? "5");
  const server = createMcpServer(
    new AgentOSAdapter(
      origin,
      new MissionVault(join(root, ".agentos", "mcp")),
      cap,
    ),
  );
  await server.connect(new StdioServerTransport());
  console.error(
    "AgentOS MCP ready (stdio). Web server required; mission creation may spend Preprod test funds.",
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      void server.close().finally(() => process.exit(0));
    });
}
void main().catch(() => {
  console.error(
    "AgentOS MCP failed to initialize. Check the build, loopback AGENTOS_BASE_URL and AGENTOS_MCP_MAX_BUDGET configuration.",
  );
  process.exitCode = 1;
});
