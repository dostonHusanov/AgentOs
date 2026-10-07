import { loadEnvConfig } from "@next/env";
import { toClientCardanoSigner } from "@x402/cardano";
import { ensureLocalConfig, setLocalValues } from "./local-config";
async function main() {
  ensureLocalConfig();
  loadEnvConfig(process.cwd());
  const updates: Record<string, string> = {};
  const missing: string[] = [];
  for (const prefix of ["MANAGER", "RESEARCH", "RESEARCH_BACKUP"]) {
    const mnemonic = process.env[`${prefix}_MNEMONIC`]?.trim();
    if (!mnemonic) {
      missing.push(`${prefix}_MNEMONIC`);
      continue;
    }
    // getAddress derives locally. No provider call or payment occurs here.
    let signer;
    try {
      signer = toClientCardanoSigner({
        mnemonic,
        network: "cardano:preprod",
        provider: {
          blockfrost: {
            baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
            projectId:
              process.env.BLOCKFROST_PROJECT_ID || "local-address-derivation",
          },
        },
      });
    } catch {
      throw new Error(
        `${prefix}_MNEMONIC is invalid. Check all words and their order locally; no phrase details were printed.`,
      );
    }
    const key = `${prefix}_WALLET_ADDRESS`,
      derived = signer.getAddress(),
      existing = process.env[key]?.trim();
    if (existing && existing !== derived)
      throw new Error(
        `${key} differs from its recovery phrase. Resolve the mismatch in .env.local; existing address was not overwritten.`,
      );
    updates[key] = derived;
  }
  if (missing.length)
    throw new Error(
      `Add ${missing.join(", ")} to .env.local first. No addresses were changed.`,
    );
  setLocalValues(updates);
  for (const [key, value] of Object.entries(updates))
    console.log(`${key}=${value}`);
  console.log(
    "Buyer addresses saved locally. Fund these public addresses with Preprod test ADA and tUSDM. Recovery phrases were not printed.",
  );
}
main().catch(async (error) => {
  const { errorSummary } = await import("../lib/errors");
  console.error(errorSummary(error));
  process.exitCode = 1;
});
