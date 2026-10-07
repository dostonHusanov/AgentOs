import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { nodeRequest } = await import("../lib/masumi/client");
  const { checkBuyerScope } = await import("../lib/masumi/escrow");
  process.env.MASUMI_NODE_URL ||= "http://127.0.0.1:3002/api/v1";
  await nodeRequest("/health");
  console.log("Seller node responds.");
  for (const id of ["manager", "research", "research-backup"]) {
    await checkBuyerScope(id);
    console.log(`${id}: node purchasing wallet matches local signer.`);
  }
  console.log(
    "MASUMI CONNECTIVITY VERIFIED. Agent registration and escrow settlement still require live receipts. No funds moved.",
  );
}
main().catch(async (error) => {
  const { errorSummary } = await import("../lib/errors");
  console.error(errorSummary(error));
  process.exitCode = 1;
});
