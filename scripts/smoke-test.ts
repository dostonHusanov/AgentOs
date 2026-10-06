import assert from "node:assert/strict";
import type { PublicMission } from "../types/mission";
const base = process.env.APP_URL ?? "http://127.0.0.1:3000";
const goal =
  "Research the best city in Southeast Asia for a remote software developer to live for one month. Compare cost of living, internet quality, safety, and coworking options. Give me a final recommendation.";
async function main() {
  const health = await (await fetch(base + "/api/health")).json();
  assert.equal(
    health.paymentMode,
    "simulation",
    "Smoke test must never spend real funds",
  );
  assert.equal(health.aiMode, "fixture", "Smoke test requires fixture AI");
  for (const scenario of ["success", "recovery", "budget"] as const) {
    const created = await fetch(base + "/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, budget: scenario === "budget" ? 0.1 : 5 }),
    });
    assert.equal(created.status, 201);
    const m = (await created.json()) as PublicMission & { accessToken: string };
    const headers = { Authorization: `Bearer ${m.accessToken}` };
    assert.equal((await fetch(`${base}/api/missions/${m.id}`)).status, 401);
    assert.equal(
      (await fetch(`${base}/api/missions/${m.id}/start`, { method: "POST" }))
        .status,
      401,
    );
    if (scenario === "recovery")
      assert.equal(
        (
          await fetch(`${base}/api/missions/${m.id}/failure`, {
            method: "POST",
            headers,
          })
        ).status,
        200,
      );
    const events = await fetch(`${base}/api/missions/${m.id}/events`, {
      headers,
    });
    assert.equal(events.headers.get("content-type"), "text/event-stream");
    const reader = events.body?.getReader();
    assert.ok(reader);
    const snapshot = await reader.read();
    const eventText = new TextDecoder().decode(snapshot.value);
    assert.ok(eventText.includes("event: snapshot"));
    assert.ok(!eventText.includes(m.accessToken));
    await reader.cancel();
    assert.equal(
      (
        await fetch(`${base}/api/missions/${m.id}/start`, {
          method: "POST",
          headers,
        })
      ).status,
      202,
    );
    let final: PublicMission | undefined;
    for (let tick = 0; tick < 100; tick++) {
      final = await (
        await fetch(`${base}/api/missions/${m.id}`, { headers })
      ).json();
      if (final && ["completed", "failed"].includes(final.status)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(final);
    assert.ok(!("accessToken" in final));
    assert.ok(final.budget.remaining >= 0);
    assert.equal(final.budget.reserved, 0);
    if (scenario === "budget") {
      assert.equal(final.status, "failed");
      assert.equal(final.payments.length, 0);
    } else {
      assert.equal(final.status, "completed", final.error);
      assert.ok(
        final.jobs.some(
          (j: {
            buyerAgentId: string;
            sellerAgentId: string;
            parentJobId?: string;
          }) =>
            j.sellerAgentId === "data" &&
            j.buyerAgentId !== "manager" &&
            j.parentJobId,
        ),
      );
      assert.equal(final.payments.length, scenario === "success" ? 3 : 4);
      assert.equal(final.budget.spent, scenario === "success" ? 1.7 : 2.55);
      assert.ok(
        final.payments.every(
          (p: { status: string; txHash?: string; explorerUrl?: string }) =>
            p.status === "simulated" && !p.txHash && !p.explorerUrl,
        ),
      );
      if (scenario === "recovery") {
        assert.ok(
          final.events.some((e: { type: string }) => e.type === "agent_failed"),
        );
        assert.ok(
          final.events.some(
            (e: { type: string }) => e.type === "replacement_selected",
          ),
        );
      }
      assert.ok(final.result);
      assert.ok(final.result.recommendation.length > 80);
    }
    const count: number = final.payments.length;
    await fetch(`${base}/api/missions/${m.id}/start`, {
      method: "POST",
      headers,
    });
    const duplicate = await (
      await fetch(`${base}/api/missions/${m.id}`, { headers })
    ).json();
    assert.equal(duplicate.payments.length, count);
    console.log(
      `PASS ${scenario}: ${final.status} · spent ${final.budget.spent} · ${count} receipts · nested hierarchy verified`,
    );
  }
  const invalid = await fetch(base + "/api/missions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal: "short", budget: -5 }),
  });
  assert.equal(invalid.status, 400);
  console.log(
    "PASS unauthorized access, invalid input, SSE transport, and idempotent start",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
