import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { parseEnv } from "node:util";
const local = parseEnv(readFileSync(".env.local", "utf8"));
const keys = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_MODEL",
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
for (const key of keys.filter(
  (k) =>
    k.endsWith("MNEMONIC") ||
    [
      "OPENROUTER_API_KEY",
      "BLOCKFROST_PROJECT_ID",
      "DATA_WALLET_ADDRESS",
      "REPORT_WALLET_ADDRESS",
    ].includes(k),
))
  if (!local[key]) throw Error("Missing local setting: " + key);
writeFileSync(
  ".env.server",
  keys
    .filter((k) => local[k])
    .map((k) => k + "=" + JSON.stringify(local[k]))
    .join("\n") + "\n",
  { mode: 0o600 },
);
chmodSync(".env.server", 0o600);
console.log("Created private .env.server. No credential values printed.");
