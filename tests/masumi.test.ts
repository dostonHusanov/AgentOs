import { test } from "node:test";
import assert from "node:assert/strict";
import { USDM_PREPROD_ASSET } from "@x402/cardano";
import { mapNativeEntry, type RegistryEntry } from "../lib/masumi/registry";
import { validateEscrowRecord } from "../lib/masumi/escrow";
import { nodeRequest, type EscrowRecord } from "../lib/masumi/client";
import type { AgentDefinition } from "../types/agent";
import type { Payment } from "../types/mission";
const identifier = "a".repeat(64),
  wallet = "addr_test1seller",
  contract = "addr_test1contract";
const local: AgentDefinition = {
  id: "test-native",
  name: "Local",
  description: "Owned",
  capabilities: ["web_research"],
  endpoint: "http://127.0.0.1:3001/api/agents/test-native/execute",
  pricing: { amount: 1, asset: "tUSDM" },
  reputation: 88,
  reliability: 0.9,
  status: "online",
  walletAddress: wallet,
  source: "local",
};
function entry(): RegistryEntry {
  return {
    id: "registry",
    agentIdentifier: identifier,
    state: "RegistrationConfirmed",
    name: "Registered",
    apiBaseUrl: local.endpoint,
    Capability: { name: "web_research" },
    SmartContractWallet: { walletAddress: wallet, walletVkey: "a".repeat(56) },
    RecipientWallet: null,
    CurrentTransaction: null,
    supportedPaymentSources: [
      {
        chain: "Cardano",
        network: "Preprod",
        paymentSourceType: "Web3CardanoV2",
        address: contract,
        pricing: {
          pricingType: "Fixed",
          fixed: [
            { asset: USDM_PREPROD_ASSET.replace(".", ""), amount: "850000" },
          ],
        },
      },
    ],
  };
}
test("native Masumi maps identity, atomic price and source index without inventing reputation", () => {
  const row = entry();
  row.supportedPaymentSources!.unshift({ chain: "EVM" });
  const result = mapNativeEntry(row, local, identifier);
  assert.equal(result.pricing.amount, 0.85);
  assert.equal(result.masumi?.sourceIndex, 1);
  assert.equal(result.registryId, identifier);
  assert.equal(result.source, "masumi");
  assert.equal(result.reputation, local.reputation);
});
test("native discovery rejects pending registrations, substituted sellers, endpoints and assets", () => {
  for (const change of [
    (e: RegistryEntry) => {
      e.state = "RegistrationRequested";
    },
    (e: RegistryEntry) => {
      e.apiBaseUrl = "https://other.invalid";
    },
    (e: RegistryEntry) => {
      e.SmartContractWallet.walletAddress = "addr_test1other";
    },
    (e: RegistryEntry) => {
      e.supportedPaymentSources = [];
    },
  ]) {
    const row = entry();
    change(row);
    assert.throws(() => mapNativeEntry(row, local, identifier));
  }
});
function payment(): Payment {
  return {
    id: "p",
    missionId: "m",
    jobId: "j",
    buyerAgentId: "manager",
    sellerAgentId: "test-native",
    amount: 1,
    asset: "tUSDM",
    network: "preprod",
    mode: "cardano",
    status: "submitted",
    createdAt: "now",
    escrow: {
      state: "purchase_pending",
      nonce: "a".repeat(20),
      inputHash: "b".repeat(64),
      agentIdentifier: identifier,
      contractAddress: contract,
      blockchainIdentifier: "bound-quote",
    },
  };
}
function record(): EscrowRecord {
  return {
    id: "r",
    blockchainIdentifier: "bound-quote",
    agentIdentifier: identifier,
    inputHash: "b".repeat(64),
    payByTime: "1",
    submitResultTime: "2",
    unlockTime: "3",
    externalDisputeUnlockTime: "4",
    onChainState: "FundsLocked",
    resultHash: null,
    NextAction: { requestedAction: "WaitingForResult" },
    PaymentSource: {
      network: "Preprod",
      smartContractAddress: contract,
      paymentSourceType: "Web3CardanoV2",
    },
    SmartContractWallet: null,
    CurrentTransaction: null,
    PaidFunds: [
      { unit: USDM_PREPROD_ASSET.replace(".", ""), amount: "1000000" },
    ],
  };
}
test("escrow amount and commitment are bound to the job, not merely node acceptance", () => {
  validateEscrowRecord(payment(), record(), "PaidFunds");
  for (const change of [
    (r: EscrowRecord) => {
      r.inputHash = "wrong";
    },
    (r: EscrowRecord) => {
      r.blockchainIdentifier = "other";
    },
    (r: EscrowRecord) => {
      r.PaymentSource.smartContractAddress = "other";
    },
    (r: EscrowRecord) => {
      r.PaidFunds![0].amount = "999999";
    },
    (r: EscrowRecord) => {
      r.PaidFunds!.push({ unit: "", amount: "1000000" });
    },
  ]) {
    const r = record();
    change(r);
    assert.throws(() => validateEscrowRecord(payment(), r, "PaidFunds"));
  }
});
test("node uses its documented token header, refuses redirects and never retries a failed POST", async () => {
  const oldFetch = globalThis.fetch,
    oldUrl = process.env.MASUMI_NODE_URL,
    oldKey = process.env.MASUMI_API_KEY;
  process.env.MASUMI_NODE_URL = "http://127.0.0.1:3002/api/v1";
  process.env.MASUMI_API_KEY = "test-masumi-key";
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get("token"), "test-masumi-key");
    assert.equal(init?.redirect, "error");
    return Response.json(
      { status: "error", error: { message: "test-masumi-key" } },
      { status: 503 },
    );
  };
  try {
    await assert.rejects(
      nodeRequest("/purchase", {}),
      (error) =>
        error instanceof Error && !error.message.includes("test-masumi-key"),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.MASUMI_NODE_URL;
    else process.env.MASUMI_NODE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.MASUMI_API_KEY;
    else process.env.MASUMI_API_KEY = oldKey;
  }
});

test("escrow spends only after a confirmed lock and credits a verified refund once", async () => {
  const { randomUUID } = await import("node:crypto");
  const { rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { toClientCardanoSigner } = await import("@x402/cardano");
  const {
    lockEscrow,
    submitEscrowResult,
    requestEscrowRefund,
    authorizeEscrowRefund,
    reconcileEscrow,
  } = await import("../lib/masumi/escrow");
  // Public BIP-39 test vector; never a funded wallet or production credential.
  const mnemonic =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const buyer = toClientCardanoSigner({
    mnemonic,
    network: "cardano:preprod",
    provider: {
      blockfrost: {
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
        projectId: "test",
      },
    },
  }).getAddress();
  const overrides = {
    MANAGER_MNEMONIC: mnemonic,
    MANAGER_WALLET_ADDRESS: buyer,
    BLOCKFROST_PROJECT_ID: "test",
    MASUMI_ESCROW_ENABLED: "true",
    MASUMI_NODE_URL: "http://127.0.0.1:3002/api/v1",
    MASUMI_API_KEY: "test-seller",
    MASUMI_MANAGER_NODE_URL: "http://127.0.0.1:3002/api/v1",
    MASUMI_MANAGER_API_KEY: "test-buyer",
  };
  const old = Object.fromEntries(
    Object.keys(overrides).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, overrides);
  const m: import("../types/mission").Mission = {
    id: randomUUID(),
    accessToken: "test",
    goal: "Research",
    status: "executing",
    budget: { initial: 5, spent: 0, reserved: 1, remaining: 4, asset: "tUSDM" },
    policy: { maxSinglePurchase: 2, minimumReputation: 80, escrowThreshold: 0 },
    jobs: [],
    payments: [],
    events: [],
    createdAt: "now",
    failNextProvider: false,
    paymentMode: "cardano",
    aiMode: "fixture",
  };
  const j: import("../types/mission").Job = {
    id: randomUUID(),
    missionId: m.id,
    buyerAgentId: "manager",
    sellerAgentId: local.id,
    capability: "web_research",
    objective: "Research",
    status: "paying",
    price: 1,
    reason: "test",
    sellerName: "Test",
    reputation: 88,
    registrySource: "masumi",
    depth: 1,
    createdAt: "now",
  };
  const agent = {
    ...local,
    registryId: identifier,
    source: "masumi" as const,
    masumi: {
      contractAddress: contract,
      sourceIndex: 0,
      sellerVkey: "seller-key",
      sellerAddress: wallet,
    },
  };
  let current = record(),
    resultHash: string | undefined;
  const previousFetch = globalThis.fetch;
  let refundQuantity = "999999",
    purchasePosts = 0,
    authorizationPosts = 0;
  globalThis.fetch = async (url, init) => {
    const endpoint = new URL(String(url));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (endpoint.pathname.endsWith("/wallet/list")) {
      assert.equal(endpoint.searchParams.get("walletType"), "Purchasing");
      return Response.json({
        status: "success",
        data: {
          Wallets: [
            {
              walletAddress: buyer,
              paymentSourceId: "source",
              type: "Purchasing",
            },
          ],
        },
      });
    }
    if (endpoint.pathname.endsWith("/payment") && init?.method === "POST") {
      assert.equal(m.budget.spent, 0);
      current = {
        ...record(),
        inputHash: body.inputHash,
        blockchainIdentifier: "bound-quote",
        RequestedFunds: record().PaidFunds,
        sellerReturnAddress: wallet,
        payByTime: String(Date.parse(body.payByTime)),
        submitResultTime: String(Date.parse(body.submitResultTime)),
        unlockTime: String(Date.parse(body.unlockTime)),
        externalDisputeUnlockTime: String(
          Date.parse(body.externalDisputeUnlockTime),
        ),
        SmartContractWallet: {
          walletAddress: wallet,
          walletVkey: "seller-key",
        },
        CurrentTransaction: {
          txHash: "c".repeat(64),
          status: "Confirmed",
          confirmations: 2,
        },
      };
      return Response.json({ status: "success", data: current });
    }
    if (endpoint.pathname.endsWith("/payment"))
      return Response.json({
        status: "success",
        data: { Payments: [current] },
      });
    if (endpoint.pathname.endsWith("/purchase") && init?.method === "POST") {
      purchasePosts++;
      assert.equal(m.budget.spent, 0);
      assert.equal(body.inputHash, current.inputHash);
      return Response.json({ status: "success", data: {} });
    }
    if (endpoint.pathname.endsWith("/purchase"))
      return Response.json({
        status: "success",
        data: {
          Purchases: [
            {
              ...current,
              SmartContractWallet: {
                walletAddress: buyer,
                walletVkey: "buyer-key",
              },
            },
          ],
        },
      });
    if (endpoint.pathname.endsWith("/utxos"))
      return Response.json({
        outputs: [
          {
            address:
              current.onChainState === "RefundWithdrawn" ? buyer : contract,
            amount: [
              {
                unit: USDM_PREPROD_ASSET.replace(".", ""),
                quantity:
                  current.onChainState === "RefundWithdrawn"
                    ? refundQuantity
                    : "1000000",
              },
            ],
          },
        ],
      });
    if (endpoint.pathname.endsWith("/submit-result"))
      resultHash = body.submitResultHash;
    if (endpoint.pathname.endsWith("/authorize-refund")) authorizationPosts++;
    return Response.json({ status: "success", data: {} });
  };
  try {
    const p = await lockEscrow(m, j, agent, { question: "test" });
    assert.equal(purchasePosts, 1);
    assert.equal(p.status, "confirmed");
    assert.equal(m.budget.spent, 1);
    assert.equal(m.budget.reserved, 0);
    await submitEscrowResult(m, j, { findings: "verified" });
    assert.equal(p.escrow?.state, "result_submission_pending");
    current.onChainState = "ResultSubmitted";
    current.resultHash = resultHash!;
    await reconcileEscrow(m, p);
    assert.equal(p.escrow?.state, "result_submitted");
    await requestEscrowRefund(m, p);
    assert.equal(m.budget.spent, 1);
    assert.equal(authorizationPosts, 0);
    await assert.rejects(
      authorizeEscrowRefund(m, p),
      /confirmed on-chain refund request/,
    );
    await reconcileEscrow(m, p);
    assert.equal(p.escrow?.state, "refund_pending");
    current.onChainState = "RefundRequested";
    current.NextAction.requestedAction = "WaitingForExternalAction";
    await authorizeEscrowRefund(m, p);
    assert.equal(authorizationPosts, 1);
    await assert.rejects(authorizeEscrowRefund(m, p), /already attempted/);
    current.onChainState = "RefundWithdrawn";
    await assert.rejects(reconcileEscrow(m, p), /did not return/);
    assert.equal(m.budget.spent, 1);
    refundQuantity = "1000000";
    await reconcileEscrow(m, p);
    await reconcileEscrow(m, p);
    assert.equal(p.escrow?.state, "refunded");
    assert.equal(m.budget.spent, 0);
    assert.equal(m.budget.remaining, 5);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(old))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    rmSync(join(process.cwd(), ".agentos", m.id + ".json"), { force: true });
  }
});
