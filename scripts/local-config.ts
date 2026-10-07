import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
export function ensureLocalConfig(root = process.cwd()) {
  const file = join(root, ".env.local");
  if (!existsSync(file))
    writeFileSync(file, readFileSync(join(root, ".env.example"), "utf8"), {
      flag: "wx",
      mode: 0o600,
    });
  chmodSync(file, 0o600);
  return file;
}
export function setLocalValues(
  values: Record<string, string>,
  root = process.cwd(),
) {
  const file = ensureLocalConfig(root);
  let content = readFileSync(file, "utf8");
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n]/.test(value))
      throw new Error("Invalid environment setting");
    // dotenv preserves escaped quotes; JSON objects therefore need a single
    // quoted value rather than JSON.stringify's double-quote escaping.
    if (value.includes('"') && value.includes("'"))
      throw new Error("Environment value contains unsupported mixed quotes");
    const encoded = value.includes('"') ? `'${value}'` : JSON.stringify(value);
    const line = `${key}=${encoded}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    content = pattern.test(content)
      ? content.replace(pattern, () => line)
      : content.trimEnd() + "\n" + line + "\n";
  }
  writeFileSync(file, content, { mode: 0o600 });
}
