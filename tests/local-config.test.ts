import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processEnv } from "@next/env";
import { setLocalValues } from "../scripts/local-config";
test("native registry bindings round-trip through Next's dotenv parser without exposing secrets", () => {
  const root = mkdtempSync(join(tmpdir(), "agentos-env-"));
  try {
    writeFileSync(join(root, ".env.example"), "EXISTING=test\n");
    const value = JSON.stringify({ research: "a".repeat(64) });
    setLocalValues({ TEST_AGENTOS_BINDINGS: value }, root);
    const contents = readFileSync(join(root, ".env.local"), "utf8");
    const [combined] = processEnv(
      [{ path: ".env.local", contents, env: {} }],
      root,
      undefined,
      true,
    );
    assert.deepEqual(JSON.parse(combined.TEST_AGENTOS_BINDINGS!), {
      research: "a".repeat(64),
    });
    assert.equal(statSync(join(root, ".env.local")).mode & 0o777, 0o600);
    assert.ok(contents.includes("EXISTING=test"));
  } finally {
    delete process.env.TEST_AGENTOS_BINDINGS;
    rmSync(root, { recursive: true, force: true });
  }
});
