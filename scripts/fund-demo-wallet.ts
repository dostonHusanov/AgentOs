import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { buyerSigner } = await import("../lib/cardano/wallet");
  for (const id of ["manager", "research", "research-backup"]) {
    console.log(`${id}: ${buyerSigner(id).getAddress()}`);
  }
  console.log(
    "Fund each buyer with test ADA and tUSDM using the official faucets:",
  );
  console.log("https://docs.cardano.org/cardano-testnets/tools/faucet/");
  console.log("https://tusdm.moneta.global");
  console.log(
    "This script prints public addresses only and does not move funds. Run npm run demo:check after funding.",
  );
}
main().catch((e) => {
  console.error(
    e instanceof Error ? e.message : "Wallet configuration unavailable",
  );
  process.exitCode = 1;
});
