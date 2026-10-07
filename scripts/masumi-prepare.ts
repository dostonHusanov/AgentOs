import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, statfsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ensureLocalConfig, setLocalValues } from "./local-config";
const PIN = "d569a338ca54d5be7441564770d75ebf89b71f12";
async function main() {
  ensureLocalConfig();
  loadEnvConfig(process.cwd());
  const values: Record<string, string> = {};
  for (const name of [
    "MASUMI_API_KEY",
    "MASUMI_RESEARCH_API_KEY",
    "MASUMI_RESEARCH_BACKUP_API_KEY",
    "MASUMI_DB_PASSWORD",
    "MASUMI_ENCRYPTION_KEY",
  ])
    if (!process.env[name]) values[name] = randomBytes(32).toString("hex");
  const defaults = {
    MASUMI_NODE_URL: "http://127.0.0.1:3002/api/v1",
    MASUMI_MANAGER_NODE_URL: "http://127.0.0.1:3002/api/v1",
    MASUMI_RESEARCH_NODE_URL: "http://127.0.0.1:3003/api/v1",
    MASUMI_RESEARCH_BACKUP_NODE_URL: "http://127.0.0.1:3004/api/v1",
    MASUMI_ESCROW_ENABLED: "false",
    MASUMI_AGENT_IDS: "{}",
  };
  // Preparation does not select the native registry until it contains identities.
  for (const [name, value] of Object.entries(defaults))
    if (process.env[name] === undefined && name !== "MASUMI_NODE_URL")
      values[name] = value;
  if (!process.env.MASUMI_MANAGER_API_KEY)
    values.MASUMI_MANAGER_API_KEY =
      process.env.MASUMI_API_KEY || values.MASUMI_API_KEY;
  setLocalValues(values);
  Object.assign(process.env, values);
  console.log(
    "Masumi local settings prepared in .env.local (0600). Secret values withheld. Discovery and escrow were not enabled.",
  );
  if (process.argv.includes("--start")) {
    const fs = statfsSync(process.cwd());
    if (fs.bavail * fs.bsize < 10 * 1024 ** 3)
      throw new Error(
        "Free at least 10 GB before building the local Masumi nodes",
      );
    if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0)
      throw new Error(
        "Docker runtime is not running. Start Docker Desktop or Colima first",
      );
    const wallets = await import("../lib/cardano/wallet");
    for (const id of ["manager", "research", "research-backup"])
      wallets.buyerSigner(id);
    const source = join(process.cwd(), ".agentos", "masumi-node", "source");
    mkdirSync(join(source, ".."), { recursive: true });
    const run = (cmd: string, args: string[], cwd?: string) => {
      if (spawnSync(cmd, args, { cwd, stdio: "inherit" }).status !== 0)
        throw new Error(`${cmd} failed`);
    };
    if (!existsSync(join(source, ".git")))
      run("git", [
        "clone",
        "--no-checkout",
        "https://github.com/masumi-network/masumi-payment-service.git",
        source,
      ]);
    run("git", ["checkout", "--detach", PIN], source);
    copyFileSync(
      join(process.cwd(), "infra/masumi/patch-refund-autowithdraw.cjs"),
      join(source, "agentos-refund-patch.cjs"),
    );
    process.env.MASUMI_NODE_URL ||= defaults.MASUMI_NODE_URL;
    const hasComposePlugin =
      spawnSync("docker", ["compose", "version"], { stdio: "ignore" })
        .status === 0;
    const composeCommand = hasComposePlugin ? "docker" : "docker-compose";
    const composeArgs = [
      ...(hasComposePlugin ? ["compose"] : []),
      "--env-file",
      ".env.local",
      "-f",
      "infra/masumi/compose.yml",
    ];
    // The upstream bundle build needs most of the local VM's memory. Keep
    // databases intact while stopping this project's nodes during the build.
    const hadImage =
      spawnSync("docker", ["image", "inspect", "agentos-masumi:local"], {
        stdio: "ignore",
      }).status === 0;
    run(composeCommand, [
      ...composeArgs,
      "stop",
      "seller-node",
      "research-node",
      "backup-node",
    ]);
    try {
      // All three services share one image; compile once.
      run(composeCommand, [...composeArgs, "build", "seller-node"]);
    } catch (error) {
      if (hadImage)
        spawnSync(composeCommand, [...composeArgs, "up", "--no-build", "-d"], {
          stdio: "inherit",
        });
      throw error;
    }
    run(composeCommand, [...composeArgs, "up", "--no-build", "-d"]);
    console.log(
      "Local Masumi nodes started on ports 3002–3004. Run npm run masumi:check, then npm run agents:register -- --submit. No registration or purchase was requested by this script.",
    );
  }
}
main().catch(async (error) => {
  const { errorSummary } = await import("../lib/errors");
  console.error(errorSummary(error));
  process.exitCode = 1;
});
