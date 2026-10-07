import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PublicMission } from "../types/mission";
loadEnvConfig(process.cwd());
async function main() {
  const escrowDemo = process.argv.includes("--escrow");
  if (escrowDemo && process.env.MASUMI_ESCROW_ENABLED !== "true")
    throw new Error(
      "Enable and verify native Masumi escrow before running the escrow demo",
    );
  const { checkHealth } = await import("../lib/health");
  const readiness = await checkHealth(true);
  if (readiness.status !== "READY")
    throw new Error(
      `Live demo requires READY. Run npm run demo:check (${readiness.status}).`,
    );
  const base = process.env.APP_URL ?? "http://127.0.0.1:3000";
  const server = (await (await fetch(base + "/api/health")).json()) as {
    paymentMode: string;
    aiMode: string;
  };
  assert.equal(
    server.paymentMode,
    "cardano",
    "Restart server with PAYMENT_MODE=cardano",
  );
  assert.equal(server.aiMode, "gemini", "Restart server with AI_MODE=gemini");
  const created = await fetch(base + "/api/missions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "Compare Kuala Lumpur, Bangkok, and Da Nang for a remote software developer living for one month. Cover cost of living, internet quality, safety, and coworking in one combined research task, then produce a final recommendation. Have the research provider discover and hire a structured_city_data specialist for an illustrative comparison, and distinguish that purchased demo dataset from current grounded web evidence.",
      budget: 5,
      policy: {
        maxSinglePurchase: 2,
        minimumReputation: 80,
        escrowThreshold: escrowDemo ? 0 : 1,
      },
    }),
  });
  if (!created.ok) throw new Error("Could not create live mission");
  const m = (await created.json()) as PublicMission & { accessToken: string };
  const headers = { Authorization: `Bearer ${m.accessToken}` };
  console.log(
    `Live mission ${m.id}. Budget 5 tUSDM; real Preprod transfers enabled.`,
  );
  const start = await fetch(`${base}/api/missions/${m.id}/start`, {
    method: "POST",
    headers,
  });
  if (!start.ok) throw new Error("Could not start live mission");
  let seen = 0;
  for (let tick = 0; tick < 600; tick++) {
    const response = await fetch(`${base}/api/missions/${m.id}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Mission polling failed");
    const current = (await response.json()) as PublicMission;
    for (const e of current.events.slice(seen))
      console.log(`${e.createdAt} ${e.type}: ${e.message}`);
    seen = current.events.length;
    if (["failed", "completed"].includes(current.status)) {
      mkdirSync(join(process.cwd(), "docs"), { recursive: true });
      const artifact = join(
        process.cwd(),
        "docs",
        `live-receipts-${m.id}.json`,
      );
      writeFileSync(artifact, JSON.stringify(current, null, 2));
      if (current.status === "failed")
        throw new Error(
          `Mission failed: ${current.error}. Receipts saved for reconciliation.`,
        );
      const confirmed = current.payments.filter(
        (p) => p.mode === "cardano" && p.status === "confirmed",
      );
      assert.ok(confirmed.length >= 1, "At least one real payment required");
      assert.ok(
        confirmed.every(
          (p) =>
            p.txHash &&
            /^[0-9a-f]{64}$/.test(p.txHash) &&
            p.explorerUrl &&
            p.buyerAddress &&
            p.sellerAddress,
        ),
        "Missing receipt evidence",
      );
      assert.ok(
        current.jobs.some((j) => j.parentJobId && j.status === "completed"),
        "No nested hire occurred; definition of done remains unmet",
      );
      if (escrowDemo)
        assert.ok(
          confirmed.length >= 3 &&
            confirmed.every(
              (p) =>
                p.escrow?.state === "result_submission_pending" ||
                p.escrow?.state === "result_submitted" ||
                p.escrow?.state === "released",
            ),
          "Missing escrow-backed deliveries",
        );
      console.log(
        `VERIFIED: completed · ${confirmed.length} real ${escrowDemo ? "escrow locks (release requires reconciliation)" : "direct payment receipts"} · nested hire · spent ${current.budget.spent} tUSDM. ${artifact}`,
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    "Live mission still running after 20 minutes. Inspect saved mission; do not retry payments blindly.",
  );
}
main().catch(async (e) => {
  const { errorSummary } = await import("../lib/errors");
  console.error(errorSummary(e));
  process.exitCode = 1;
});
