import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { checkHealth } = await import("../lib/health");
  const health = await checkHealth(true);
  console.log(`\nAgentOS — ${health.status}\n`);
  for (const c of health.checks)
    console.log(
      `${c.status.toUpperCase().padEnd(12)} ${c.component}: ${c.detail}`,
    );
  if (health.status === "BLOCKED") process.exitCode = 1;
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Health check failed");
  process.exitCode = 1;
});
