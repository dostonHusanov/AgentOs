import { loadEnvConfig } from "@next/env";
import { setLocalValues } from "./local-config";
loadEnvConfig(process.cwd());
async function main() {
  if (process.env.PAYMENT_MODE !== "cardano")
    throw new Error(
      "Run npm run setup:live first to validate wallets and enable Cardano Preprod",
    );
  const { discoverAgents } = await import("../lib/agents/discovery");
  const { checkBuyerScope } = await import("../lib/masumi/escrow");
  const agents = await discoverAgents();
  if (!agents.length || agents.some((a) => !a.masumi))
    throw new Error("Confirm native registrations before enabling escrow");
  for (const id of ["manager", "research", "research-backup"])
    await checkBuyerScope(id);
  setLocalValues({ MASUMI_ESCROW_ENABLED: "true" });
  console.log(
    "Native Masumi escrow enabled. Restart AgentOS, run npm run demo:check, then npm run demo:live -- --escrow. Enabling did not move funds; the demo makes real Preprod purchases.",
  );
}
main().catch(async (error) => {
  const { errorSummary } = await import("../lib/errors");
  console.error(errorSummary(error));
  process.exitCode = 1;
});
