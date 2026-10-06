import { loadEnvConfig } from "@next/env";
import { ensureLocalConfig, setLocalValues } from "./local-config";
import { existsSync } from "node:fs";
async function main() {
  const file = ensureLocalConfig();
  loadEnvConfig(process.cwd());
  if (!existsSync("node_modules/next/package.json"))
    throw new Error("Dependencies missing. Run npm ci.");
  if (process.argv.includes("--live")) {
    const required = [
      process.env.AI_PROVIDER === "openrouter"
        ? "OPENROUTER_API_KEY"
        : "GEMINI_API_KEY",
      "BLOCKFROST_PROJECT_ID",
      "MANAGER_MNEMONIC",
      "RESEARCH_MNEMONIC",
      "RESEARCH_BACKUP_MNEMONIC",
      "MANAGER_WALLET_ADDRESS",
      "RESEARCH_WALLET_ADDRESS",
      "RESEARCH_BACKUP_WALLET_ADDRESS",
      "DATA_WALLET_ADDRESS",
      "REPORT_WALLET_ADDRESS",
    ];
    const missing = required.filter((name) => !process.env[name]?.trim());
    if (missing.length)
      throw new Error(
        `Fill these integrations in .env.local: ${missing.join(", ")}. Run npm run wallet:sync after adding recovery phrases.`,
      );
    const { buyerSigner } = await import("../lib/cardano/wallet");
    for (const id of ["manager", "research", "research-backup"])
      buyerSigner(id);
    setLocalValues({
      AI_MODE: "gemini",
      PAYMENT_MODE: "cardano",
      CARDANO_NETWORK: "preprod",
    });
    console.log(
      "Live modes configured. Restart the server, then run npm run demo:check. No funds were moved.",
    );
  } else
    console.log(
      `Local setup ready: ${file}\nExisting values preserved; file permissions restricted.\nAdd your API keys, three buyer recovery phrases, and Data/Report recipient addresses.\nThen run npm run wallet:sync and npm run setup:live.\nUntil live setup, the example configuration uses labeled fixture AI and simulated payments.`,
    );
}
main().catch(async (error) => {
  const { errorSummary } = await import("../lib/errors");
  console.error(errorSummary(error));
  process.exitCode = 1;
});
