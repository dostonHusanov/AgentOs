import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { acceptPayment } from "../lib/cardano/x402";
import { localAgents } from "../lib/agents/discovery";
import { reserve } from "../lib/mission/policies";
import { FileSettlementStore } from "../lib/cardano/settlement-store";
import { errorSummary } from "../lib/errors";
import type { Mission, Job } from "../types/mission";
test("simulation proof is job-bound and repeated proof never spends twice", async () => {
  const id = randomUUID();
  const m: Mission = {
    id,
    accessToken: "secret",
    goal: "A simulation test mission",
    status: "purchasing",
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
  const j: Job = {
    id: randomUUID(),
    missionId: id,
    buyerAgentId: "manager",
    sellerAgentId: "research",
    capability: "web_research",
    objective: m.goal,
    status: "paying",
    price: 1,
    reason: "Test selection",
    sellerName: "ResearchPro",
    reputation: 95,
    registrySource: "local",
    depth: 1,
    createdAt: m.createdAt,
  };
  m.jobs.push(j);
  reserve(m, 1);
  const pid = randomUUID();
  const proof = Buffer.from(
    JSON.stringify({ simulation: true, paymentId: pid, jobId: j.id }),
  ).toString("base64");
  m.payments.push({
    id: pid,
    missionId: id,
    jobId: j.id,
    buyerAgentId: "manager",
    sellerAgentId: "research",
    amount: 1,
    asset: "tUSDM",
    network: "preprod",
    status: "reserved",
    mode: "simulation",
    createdAt: m.createdAt,
    proofDigest: createHash("sha256").update(proof).digest("hex"),
  });
  try {
    await assert.rejects(() => acceptPayment(m, j, localAgents()[0], "forged"));
    await acceptPayment(m, j, localAgents()[0], proof);
    await acceptPayment(m, j, localAgents()[0], proof);
    assert.equal(m.budget.spent, 1);
    assert.equal(m.budget.reserved, 0);
    assert.equal(m.payments[0].status, "simulated");
    assert.equal(m.payments[0].txHash, undefined);
    await assert.rejects(() => acceptPayment(m, j, localAgents()[0], "forged"));
  } finally {
    rmSync(join(process.cwd(), ".agentos", id + ".json"), { force: true });
  }
});
test("durable settlement claims preserve ownership and reject duplicate broadcasts", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentos-store-"));
  try {
    const store = new FileSettlementStore(root);
    const claim = { txHash: "a".repeat(64), ownerToken: "owner" };
    assert.equal(await store.claimSettlement(claim), "fresh");
    assert.equal(
      await store.claimSettlement({ ...claim, ownerToken: "other" }),
      "in-flight",
    );
    await store.releaseClaim(claim.txHash, "other");
    assert.equal(await store.claimSettlement(claim), "in-flight");
    await store.markSubmitted(claim.txHash, "owner");
    assert.equal(
      await new FileSettlementStore(root).claimSettlement(claim),
      "submitted",
    );
    const rejected = { txHash: "b".repeat(64), ownerToken: "owner" };
    await store.claimSettlement(rejected);
    await store.markRejected(rejected.txHash, "owner");
    assert.equal(await store.claimSettlement(rejected), "rejected");
    await assert.rejects(() =>
      store.claimSettlement({ ...claim, termsDigest: "unsupported" }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("secret-bearing external errors are redacted", () => {
  process.env.AGENTOS_TEST_SECRET = "never-display-this-secret";
  try {
    assert.equal(
      errorSummary(new Error("Failed: never-display-this-secret")),
      "Failed: [redacted]",
    );
  } finally {
    delete process.env.AGENTOS_TEST_SECRET;
  }
});
