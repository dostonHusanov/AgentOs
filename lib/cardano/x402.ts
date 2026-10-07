import {
  randomUUID,
  randomBytes,
  createHmac,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { USDM_PREPROD_ASSET, decodeCardanoTransaction } from "@x402/cardano";
import { ExactCardanoScheme as CardanoClient } from "@x402/cardano/exact/client";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import type { Mission, Job, Payment } from "@/types/mission";
import type { AgentDefinition } from "@/types/agent";
import { buyerSigner, facilitator } from "./wallet";
import { explorerUrl } from "./explorer";
import { event, save } from "@/lib/mission/store";
import { units, settleBudget } from "@/lib/mission/policies";
import { lockEscrow } from "@/lib/masumi/escrow";
const globals = globalThis as typeof globalThis & {
  agentosSigningSecret?: string;
};
const secret = (globals.agentosSigningSecret ??=
  randomBytes(32).toString("hex"));
export function internalToken(m: Mission, j: Job) {
  return createHmac("sha256", secret).update(`${m.id}:${j.id}`).digest("hex");
}
export function checkInternalToken(token: string, m: Mission, j: Job) {
  const expected = internalToken(m, j);
  if (
    Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    throw new Error("Unauthorized");
}
export function requirements(
  m: Mission,
  j: Job,
  a: AgentDefinition,
): PaymentRequirements {
  const payTo =
    m.paymentMode === "cardano" ? a.walletAddress : `simulation:${a.id}`;
  if (!payTo) throw new Error(`Seller wallet missing for ${a.name}`);
  return {
    scheme: "exact",
    network: "cardano:preprod",
    asset: USDM_PREPROD_ASSET,
    amount: String(units(j.price)),
    payTo,
    maxTimeoutSeconds: 600,
    extra: {
      assetTransferMethod: "default",
      confirmationPolicy: { l1Confirmations: 1 },
    },
  };
}
const reqSchema = z.object({
  scheme: z.literal("exact"),
  network: z.literal("cardano:preprod"),
  asset: z.literal(USDM_PREPROD_ASSET),
  amount: z.string().regex(/^[1-9][0-9]*$/),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().int().min(1).max(600),
  extra: z.object({
    assetTransferMethod: z.literal("default"),
    confirmationPolicy: z.object({ l1Confirmations: z.literal(1) }),
  }),
});
export function validateRequirements(
  value: unknown,
  expected: PaymentRequirements,
): PaymentRequirements {
  const parsed = reqSchema.parse(value);
  if (
    parsed.payTo !== expected.payTo ||
    parsed.amount !== expected.amount ||
    parsed.asset !== expected.asset ||
    parsed.network !== expected.network
  )
    throw new Error("Payment requirements mismatch");
  return parsed;
}
async function performPaidRequest(
  m: Mission,
  j: Job,
  a: AgentDefinition,
  context: unknown,
) {
  // External registry entries are discoverable, but require a compatible job
  // transport. Never send mission tokens or pay arbitrary discovered endpoints.
  const url = new URL(a.endpoint);
  const own = new URL(process.env.APP_URL ?? "http://127.0.0.1:3000");
  if (
    url.origin !== own.origin ||
    url.pathname !== `/api/agents/${a.id}/execute`
  )
    throw new Error("Remote agent execution transport is not configured");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${m.accessToken}`,
    "X-AgentOS-Internal": internalToken(m, j),
    "Idempotency-Key": j.id,
  };
  const body = JSON.stringify({ missionId: m.id, jobId: j.id, context });
  if (j.price > m.policy.escrowThreshold) {
    const payment = await lockEscrow(m, j, a, context);
    const signature = Buffer.from(
      JSON.stringify({
        masumi: true,
        paymentId: payment.id,
        jobId: j.id,
        blockchainIdentifier: payment.escrow!.blockchainIdentifier,
      }),
    ).toString("base64");
    payment.proofDigest = createHash("sha256").update(signature).digest("hex");
    save(m);
    const response = await fetch(a.endpoint, {
      method: "POST",
      headers: { ...headers, "PAYMENT-SIGNATURE": signature },
      body,
      signal: AbortSignal.timeout(600000),
    });
    if (!response.ok)
      throw new Error(
        `Escrow-backed agent execution failed (${response.status})`,
      );
    return response.json();
  }
  const request = () =>
    fetch(a.endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(240000),
    });
  j.status = "payment_required";
  event(
    m,
    "payment_requested",
    `${j.buyerAgentId} → ${a.name}: ${j.price} tUSDM`,
    j.id,
  );
  const first = await request();
  if (first.status !== 402)
    throw new Error(`Expected HTTP 402, received ${first.status}`);
  const required = (await first.json()) as { accepts?: unknown[] };
  const accepted = validateRequirements(
    required.accepts?.[0],
    requirements(m, j, a),
  );
  const payment: Payment = {
    id: randomUUID(),
    missionId: m.id,
    jobId: j.id,
    buyerAgentId: j.buyerAgentId,
    sellerAgentId: a.id,
    amount: j.price,
    asset: "tUSDM",
    network: "preprod",
    status: "reserved",
    mode: m.paymentMode,
    createdAt: new Date().toISOString(),
  };
  m.payments.push(payment);
  j.status = "paying";
  save(m);
  let signature: string;
  if (m.paymentMode === "simulation")
    signature = Buffer.from(
      JSON.stringify({ simulation: true, paymentId: payment.id, jobId: j.id }),
    ).toString("base64");
  else {
    const payload = await new CardanoClient(
      buyerSigner(j.buyerAgentId),
    ).createPaymentPayload(2, accepted);
    const full: PaymentPayload = {
      ...payload,
      accepted,
      resource: {
        url: a.endpoint,
        description: j.objective,
        mimeType: "application/json",
      },
    };
    signature = Buffer.from(JSON.stringify(full)).toString("base64");
    // Write signed bytes before broadcast. On restart never sign a replacement
    // for an uncertain payment. Reconcile the persisted hash and proof first.
    const root = join(process.cwd(), ".agentos", "proofs");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, j.id + ".json"), JSON.stringify(full), {
      mode: 0o600,
    });
    const tx = (payload.payload as { transaction: string }).transaction;
    payment.txHash = decodeCardanoTransaction(tx).txHash;
    payment.status = "submitted";
    payment.explorerUrl = explorerUrl(payment.txHash);
    save(m);
    event(
      m,
      "payment_signed",
      "Signed transaction prepared; awaiting submission and confirmation",
      j.id,
    );
  }
  payment.proofDigest = createHash("sha256").update(signature).digest("hex");
  save(m);
  const response = await fetch(a.endpoint, {
    method: "POST",
    headers: { ...headers, "PAYMENT-SIGNATURE": signature },
    body,
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    throw new Error(data.error ?? `Paid request failed (${response.status})`);
  }
  return response.json();
}
const walletGlobals = globalThis as typeof globalThis & {
  agentosWalletQueues?: Map<string, Promise<void>>;
};
const queues = (walletGlobals.agentosWalletQueues ??= new Map());
export async function paidRequest(
  m: Mission,
  j: Job,
  a: AgentDefinition,
  context: unknown,
) {
  const previous = queues.get(j.buyerAgentId) ?? Promise.resolve();
  let unlock!: () => void;
  const next = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  queues.set(j.buyerAgentId, next);
  await previous;
  try {
    return await performPaidRequest(m, j, a, context);
  } finally {
    unlock();
    if (queues.get(j.buyerAgentId) === next) queues.delete(j.buyerAgentId);
  }
}
export async function acceptPayment(
  m: Mission,
  j: Job,
  a: AgentDefinition,
  signature: string,
) {
  const payment = m.payments.find((p) => p.jobId === j.id);
  if (!payment) throw new Error("Payment record missing");
  if (
    createHash("sha256").update(signature).digest("hex") !== payment.proofDigest
  )
    throw new Error("Payment signature not bound to job");
  if (payment.escrow) {
    if (
      m.paymentMode !== "cardano" ||
      payment.status !== "confirmed" ||
      !(
        payment.escrow.state === "funds_locked" ||
        (j.result !== undefined &&
          [
            "result_submission_pending",
            "result_submitted",
            "released",
          ].includes(payment.escrow.state))
      )
    )
      throw new Error("Masumi escrow lock is not confirmed or available");
    const proof = JSON.parse(Buffer.from(signature, "base64").toString("utf8"));
    if (
      !proof.masumi ||
      proof.paymentId !== payment.id ||
      proof.jobId !== j.id ||
      proof.blockchainIdentifier !== payment.escrow.blockchainIdentifier
    )
      throw new Error("Escrow proof mismatch");
    return;
  }
  if (payment.status === "confirmed" || payment.status === "simulated") return;
  if (signature.length > 120000) throw new Error("Payment payload too large");
  const payload = JSON.parse(
    Buffer.from(signature, "base64").toString("utf8"),
  ) as PaymentPayload & {
    simulation?: boolean;
    paymentId?: string;
    jobId?: string;
  };
  if (m.paymentMode === "simulation") {
    if (
      !payload.simulation ||
      payload.paymentId !== payment.id ||
      payload.jobId !== j.id
    )
      throw new Error("Invalid simulation proof");
    payment.status = "simulated";
    settleBudget(m, j.price);
    event(
      m,
      "payment_simulated",
      `SIMULATED PAYMENT · ${j.buyerAgentId} → ${a.name} · ${j.price} tUSDM`,
      j.id,
    );
    return;
  }
  if (payload.simulation)
    throw new Error("Simulation proof rejected in Cardano mode");
  const expected = requirements(m, j, a);
  validateRequirements(payload.accepted, expected);
  const saved = join(process.cwd(), ".agentos", "proofs", j.id + ".json");
  if (
    !existsSync(saved) ||
    JSON.stringify(payload) !== readFileSync(saved, "utf8")
  )
    throw new Error("Proof not bound to this job");
  const decoded = decodeCardanoTransaction(
    (payload.payload as { transaction: string }).transaction,
  );
  if (decoded.txHash !== payment.txHash)
    throw new Error("Transaction does not belong to job");
  // Durable canonical-hash claim prevents a settled payment being replayed for
  // another operation, including after a server restart.
  const root = join(process.cwd(), ".agentos", "claims");
  mkdirSync(root, { recursive: true });
  const claim = join(root, decoded.txHash);
  if (existsSync(claim)) {
    if (readFileSync(claim, "utf8") !== j.id)
      throw new Error("Transaction already claimed by another job");
  } else writeFileSync(claim, j.id, { flag: "wx", mode: 0o600 });
  const f = facilitator();
  let settled = await f.settle(payload, expected);
  event(
    m,
    "payment_submitted",
    `Cardano settlement: ${settled.transaction || decoded.txHash}`,
    j.id,
  );
  if (!settled.success && settled.errorReason === "settlement_pending")
    settled = await f.settle(payload, expected);
  if (!settled.success)
    throw new Error(
      `Cardano settlement unconfirmed: ${settled.errorReason}. Reconcile receipt before retry.`,
    );
  const buyer = buyerSigner(j.buyerAgentId).getAddress();
  payment.buyerAddress = buyer;
  payment.sellerAddress = expected.payTo;
  if (settled.payer !== buyer)
    throw new Error("Confirmed payer differs from buyer wallet");
  payment.txHash = settled.transaction;
  payment.explorerUrl = explorerUrl(settled.transaction);
  payment.status = "confirmed";
  settleBudget(m, j.price);
  event(
    m,
    "payment_confirmed",
    `REAL PAYMENT · ${j.buyerAgentId} → ${a.name} · ${j.price} tUSDM`,
    j.id,
  );
}
