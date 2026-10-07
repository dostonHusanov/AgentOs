import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync, spawn } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const config = parseEnv(readFileSync(resolve(root, ".env.local"), "utf8"));
const key = config.CONTROL_PLANE_API_KEY;
const id = config.OPENAI_TUNNEL_ID;
if (!key || key.includes("your_") || !/^tunnel_[a-f0-9]+$/.test(id ?? "")) {
  console.error("Set valid tunnel credentials in .env.local.");
  process.exit(1);
}
const binary = resolve(root, ".agentos/tunnel/bin/tunnel-client");
const env = {
  ...process.env,
  CONTROL_PLANE_API_KEY: key,
  TUNNEL_CLIENT_PROFILE_DIR: resolve(root, ".agentos/tunnel/profiles"),
  AGENTOS_BASE_URL: config.APP_URL ?? "http://127.0.0.1:3001",
  AGENTOS_MCP_MAX_BUDGET: "5",
};
const safe = (s) => s.replaceAll(key, "[REDACTED]");
const mode = process.argv[2] ?? "run";
if (mode === "init") {
  const r = spawnSync(
    binary,
    [
      "init",
      "--sample",
      "sample_mcp_stdio_local",
      "--profile",
      "agentos",
      "--tunnel-id",
      id,
      "--mcp-command",
      `/usr/local/bin/node ${resolve(root, "dist/mcp/server.js")}`,
      "--health-listen-addr",
      "127.0.0.1:8788",
    ],
    { env, cwd: root, encoding: "utf8" },
  );
  console.log(safe((r.stdout ?? "") + (r.stderr ?? "")));
  process.exit(r.status ?? 1);
}
const args =
  mode === "doctor"
    ? ["doctor", "--profile", "agentos", "--explain"]
    : ["run", "--profile", "agentos"];
const child = spawn(binary, args, {
  env,
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (b) => process.stdout.write(safe(b.toString())));
child.stderr.on("data", (b) => process.stderr.write(safe(b.toString())));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
