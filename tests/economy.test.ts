import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePurchase,
  reserve,
  settleBudget,
  release,
} from "../lib/mission/policies";
import { evaluate } from "../lib/agents/evaluator";
import { localAgents } from "../lib/agents/discovery";
import { validateRequirements, requirements } from "../lib/cardano/x402";
import { verifyResult } from "../lib/agents/verifier";
import { validatePlanBudget } from "../lib/mission/planner";
import type { Mission, Job } from "../types/mission";
function mission(): Mission {
  return {
    id: "test",
    accessToken: "secret",
    goal: "Research a city",
    status: "created",
    budget: { initial: 5, spent: 0, reserved: 0, remaining: 5, asset: "tUSDM" },
    policy: { maxSinglePurchase: 2, minimumReputation: 80, escrowThreshold: 1 },
    jobs: [],
    payments: [],
    events: [],
    createdAt: new Date().toISOString(),
    failNextProvider: false,
    paymentMode: "simulation",
    aiMode: "fixture",
  };
}
test("nested purchases share a fixed-point mission budget", () => {
  const m = mission();
  for (const price of [1, 0.2, 0.5]) {
    reserve(m, price);
    settleBudget(m, price);
  }
  assert.deepEqual(m.budget, {
    initial: 5,
    spent: 1.7,
    reserved: 0,
    remaining: 3.3,
    asset: "tUSDM",
  });
  assert.throws(() => reserve(m, 3.300001));
  reserve(m, 0.2);
  release(m, 0.2);
  assert.equal(m.budget.remaining, 3.3);
});
test("provider ranking selects by policy and capabilities", () => {
  const m = mission();
  const ranking = evaluate(
    m,
    localAgents().filter((a) => a.capabilities.includes("web_research")),
    "web_research",
    1,
    ["manager"],
  );
  assert.equal(ranking.find((a) => !a.rejection)?.agent.id, "research");
  assert.ok(ranking.find((a) => a.agent.id === "research-premium")?.rejection);
});
test("planning budgets for selected providers and implicit final synthesis before purchasing", () => {
  const m = mission();
  const plan = {
    summary: "Research then synthesize",
    tasks: Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      capability: "web_research",
      objective: "Compare cities",
      dependsOn: [],
    })),
  };
  // The cheapest research provider would fit, but the actual ranking selects
  // a different provider. The implicit final report also needs a budget.
  assert.throws(() => validatePlanBudget(m, plan, localAgents()), /5.5 tUSDM/);
  assert.doesNotThrow(() =>
    validatePlanBudget(
      m,
      { ...plan, tasks: plan.tasks.slice(0, 1) },
      localAgents(),
    ),
  );
  assert.deepEqual(m.payments, []);
  assert.equal(m.budget.reserved, 0);
});
test("reputation, cycles, depth, and escrow fail closed", () => {
  const m = mission(),
    a = localAgents()[0];
  assert.throws(() => validatePurchase(m, a, "web_research", 4, []));
  assert.throws(() => validatePurchase(m, a, "web_research", 1, ["research"]));
  m.policy.minimumReputation = 96;
  assert.throws(() => validatePurchase(m, a, "web_research", 1, []));
  m.policy.minimumReputation = 80;
  m.policy.escrowThreshold = 0.9;
  assert.throws(() => validatePurchase(m, a, "web_research", 1, []));
});
test("402 requirements reject recipient, network, amount, and asset changes", () => {
  const m = mission(),
    a = localAgents()[0],
    j = { price: 1 } as Job;
  const req = requirements(m, j, a);
  assert.deepEqual(validateRequirements(req, req), req);
  for (const patch of [
    { payTo: "attacker" },
    { network: "cardano:mainnet" },
    { amount: "2000000" },
    { asset: "lovelace" },
  ])
    assert.throws(() => validateRequirements({ ...req, ...patch }, req));
});
test("malformed provider outputs fail verification", () => {
  assert.throws(() =>
    verifyResult("structured_city_data", {
      cities: [{ city: "Da Nang", monthlyCostEstimate: "cheap" }],
    }),
  );
  assert.throws(() =>
    verifyResult("web_research", { summary: "OK", findings: [], sources: [] }),
  );
  assert.throws(() => verifyResult("report_generation", { title: "Empty" }));
});
