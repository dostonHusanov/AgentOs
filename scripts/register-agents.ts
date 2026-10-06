import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { localAgents } = await import("../lib/agents/discovery");
  console.log(JSON.stringify(localAgents(), null, 2));
  console.error(
    "Metadata export only. Registration requires your Masumi node's documented register-agent flow; no registration transaction has been submitted.",
  );
}
main().catch(() => {
  console.error("Metadata export failed");
  process.exitCode = 1;
});
