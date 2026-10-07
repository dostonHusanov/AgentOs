import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { USDM_PREPROD_ASSET, jcs } from "@x402/cardano";
import type { AgentDefinition } from "@/types/agent";
import type { Mission, Job, Payment } from "@/types/mission";
import {
  nodeRequest,
  nodeConfig,
  escrowRecordSchema,
  findPurchase,
  findPayment,
  type EscrowRecord,
} from "./client";
import { buyerSigner } from "@/lib/cardano/wallet";
import {
  units,
  settleBudget,
  recalculate,
  release,
} from "@/lib/mission/policies";
import { event, save } from "@/lib/mission/store";
import { explorerUrl } from "@/lib/cardano/explorer";
export const escrowEnabled = () => process.env.MASUMI_ESCROW_ENABLED === "true";
export function canEscrow(a: AgentDefinition) {
  return (
    escrowEnabled() &&
    Boolean(a.masumi && a.registryId && process.env.MASUMI_NODE_URL)
  );
}
const walletsSchema = z.object({
  Wallets: z.array(
    z.object({
      walletAddress: z.string(),
      paymentSourceId: z.string(),
      type: z.string(),
    }),
  ),
});
export async function checkBuyerScope(buyerId: string) {
  nodeConfig(buyerId);
  const expected = buyerSigner(buyerId).getAddress();
  const data = walletsSchema.parse(
    await nodeRequest(
      "/wallet/list?walletType=Purchasing&take=100",
      undefined,
      buyerId,
    ),
  );
  // A key that can choose another buyer wallet is unsuitable for independent
  // per-agent budgets. Node selection must be unambiguous BEFORE a purchase.
  if (data.Wallets.length !== 1 || data.Wallets[0].walletAddress !== expected)
    throw new Error(
      `Masumi ${buyerId} API key must be scoped to exactly its purchasing wallet`,
    );
  return expected;
}
export function validateEscrowRecord(
  p: Payment,
  record: EscrowRecord,
  funds: "RequestedFunds" | "PaidFunds",
) {
  const e = p.escrow;
  if (
    !e ||
    record.inputHash !== e.inputHash ||
    record.agentIdentifier !== e.agentIdentifier ||
    record.PaymentSource.smartContractAddress !== e.contractAddress ||
    (e.blockchainIdentifier &&
      record.blockchainIdentifier !== e.blockchainIdentifier)
  )
    throw new Error("Masumi escrow identity/commitment mismatch");
  const amounts = record[funds];
  if (
    !amounts ||
    amounts.length !== 1 ||
    amounts[0].unit !== USDM_PREPROD_ASSET.replace(".", "") ||
    amounts[0].amount !== String(units(p.amount))
  )
    throw new Error("Masumi escrow amount/asset mismatch");
}
async function observeLock(m: Mission, p: Payment, buyer: string) {
  const e = p.escrow!;
  const record = await findPurchase(e.blockchainIdentifier!, p.buyerAgentId);
  validateEscrowRecord(p, record, "PaidFunds");
  if (record.SmartContractWallet?.walletAddress !== buyer)
    throw new Error("Masumi purchasing wallet differs from mission buyer");
  if (record.onChainState !== "FundsLocked")
    throw new Error(
      "Masumi funds are not locked yet; reconcile before retrying",
    );
  const tx = [
    record.CurrentTransaction,
    ...(record.TransactionHistory || []),
  ].find(
    (t) => t?.status === "Confirmed" && t.txHash && (t.confirmations || 0) >= 1,
  );
  if (!tx?.txHash)
    throw new Error("Masumi lock has no confirmed transaction evidence");
  // Independently verify that the node's claimed transaction exists and pays
  // exactly the mission asset to the pinned escrow contract.
  const headers = { project_id: process.env.BLOCKFROST_PROJECT_ID || "" };
  const response = await fetch(
    `https://cardano-preprod.blockfrost.io/api/v0/txs/${tx.txHash}/utxos`,
    { headers, signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok)
    throw new Error("Escrow transaction not independently visible on Preprod");
  const data = z
    .object({
      outputs: z.array(
        z.object({
          address: z.string(),
          amount: z.array(z.object({ unit: z.string(), quantity: z.string() })),
        }),
      ),
    })
    .parse(await response.json());
  if (
    !data.outputs.some(
      (o) =>
        o.address === e.contractAddress &&
        o.amount.some(
          (a) =>
            a.unit === USDM_PREPROD_ASSET.replace(".", "") &&
            a.quantity === String(units(p.amount)),
        ),
    )
  )
    throw new Error("Escrow transaction output mismatch");
  p.txHash = tx.txHash;
  p.explorerUrl = explorerUrl(tx.txHash);
  p.status = "confirmed";
  p.buyerAddress = buyer;
  e.state = "funds_locked";
  settleBudget(m, p.amount);
  event(
    m,
    "escrow_locked",
    `REAL ESCROW LOCK · ${p.amount} tUSDM · ${p.buyerAgentId} → ${p.sellerAgentId}`,
    p.jobId,
  );
  save(m);
}
export async function lockEscrow(
  m: Mission,
  job: Job,
  agent: AgentDefinition,
  context: unknown,
) {
  if (m.paymentMode !== "cardano" || !canEscrow(agent))
    throw new Error("Native Masumi escrow is not configured for this provider");
  const buyer = await checkBuyerScope(job.buyerAgentId);
  if (m.payments.some((p) => p.jobId === job.id))
    throw new Error(
      "Existing escrow must be reconciled; never submit a replacement purchase",
    );
  const inputHash = createHash("sha256")
    .update(
      jcs({
        missionId: m.id,
        jobId: job.id,
        objective: job.objective,
        context: context ?? null,
      }),
    )
    .digest("hex");
  const p: Payment = {
    id: randomUUID(),
    missionId: m.id,
    jobId: job.id,
    buyerAgentId: job.buyerAgentId,
    sellerAgentId: agent.id,
    amount: job.price,
    asset: "tUSDM",
    network: "preprod",
    mode: "cardano",
    status: "submitted",
    createdAt: new Date().toISOString(),
    sellerAddress: agent.walletAddress,
    escrow: {
      state: "quote_pending",
      nonce: randomBytes(10).toString("hex"),
      inputHash,
      agentIdentifier: agent.registryId!,
      contractAddress: agent.masumi!.contractAddress,
    },
  };
  m.payments.push(p);
  job.status = "paying";
  save(m);
  const e = p.escrow!;
  // Every mutating request is preceded by a durable intent. Ambiguous errors
  // retain the reservation and require reconciliation; no POST auto-retries.
  const now = Date.now();
  const quote = escrowRecordSchema.parse(
    await nodeRequest("/payment", {
      network: "Preprod",
      paymentSourceType: "Web3CardanoV2",
      supportedPaymentSourceIndex: agent.masumi!.sourceIndex,
      agentIdentifier: e.agentIdentifier,
      identifierFromPurchaser: e.nonce,
      inputHash,
      payByTime: new Date(now + 30 * 60_000).toISOString(),
      submitResultTime: new Date(now + 2 * 3600_000).toISOString(),
      unlockTime: new Date(now + 26 * 3600_000).toISOString(),
      externalDisputeUnlockTime: new Date(now + 50 * 3600_000).toISOString(),
      forceLayer: "L1",
      sellerReturnAddress: agent.walletAddress,
    }),
  );
  validateEscrowRecord(p, quote, "RequestedFunds");
  if (
    quote.SmartContractWallet?.walletAddress !== agent.masumi!.sellerAddress ||
    quote.SmartContractWallet?.walletVkey !== agent.masumi!.sellerVkey ||
    quote.sellerReturnAddress !== agent.walletAddress
  )
    throw new Error("Masumi quote seller mismatch");
  const deadline = Number(quote.payByTime);
  if (
    quote.submitResultTime !== String(now + 2 * 3600_000) ||
    quote.unlockTime !== String(now + 26 * 3600_000) ||
    quote.externalDisputeUnlockTime !== String(now + 50 * 3600_000)
  )
    throw new Error(
      "Masumi quote delivery/release deadlines differ from requested policy",
    );
  if (
    !Number.isSafeInteger(deadline) ||
    deadline < Date.now() + 60_000 ||
    deadline > now + 31 * 60_000
  )
    throw new Error("Masumi quote payment deadline mismatch");
  e.quote = quote;
  e.blockchainIdentifier = quote.blockchainIdentifier;
  e.state = "purchase_pending";
  save(m);
  await nodeRequest(
    "/purchase",
    {
      network: "Preprod",
      paymentSourceType: "Web3CardanoV2",
      smartContractAddress: e.contractAddress,
      supportedPaymentSourceIndex: agent.masumi!.sourceIndex,
      blockchainIdentifier: e.blockchainIdentifier,
      agentIdentifier: e.agentIdentifier,
      inputHash,
      identifierFromPurchaser: e.nonce,
      sellerVkey: agent.masumi!.sellerVkey,
      payByTime: quote.payByTime,
      submitResultTime: quote.submitResultTime,
      unlockTime: quote.unlockTime,
      externalDisputeUnlockTime: quote.externalDisputeUnlockTime,
      Amounts: quote.RequestedFunds,
      buyerReturnAddress: buyer,
      forceLayer: "L1",
      paymentForceLayer: "L1",
      ...(quote.sellerReturnAddress
        ? { sellerReturnAddress: quote.sellerReturnAddress }
        : {}),
    },
    job.buyerAgentId,
  );
  event(
    m,
    "escrow_requested",
    "Native Masumi purchase requested; waiting for confirmed funds lock",
    job.id,
  );
  const end = Date.now() + 5 * 60_000;
  while (Date.now() < end) {
    const record = await findPurchase(e.blockchainIdentifier, job.buyerAgentId);
    if (record.NextAction.errorType)
      throw new Error(
        "Masumi purchase requires reconciliation; node reported an error",
      );
    if (record.onChainState === "FundsLocked") {
      await observeLock(m, p, buyer);
      return p;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("Masumi lock remains pending; funds reservation retained");
}
export async function submitEscrowResult(
  m: Mission,
  job: Job,
  output: unknown,
) {
  const p = m.payments.find((p) => p.jobId === job.id && p.escrow);
  if (!p?.escrow) return;
  const e = p.escrow;
  if (e.state !== "funds_locked")
    throw new Error("Escrow is not ready for result submission");
  e.resultHash = createHash("sha256").update(jcs(output)).digest("hex");
  e.state = "result_submission_pending";
  save(m);
  await nodeRequest("/payment/submit-result", {
    network: "Preprod",
    blockchainIdentifier: e.blockchainIdentifier,
    submitResultHash: e.resultHash,
  });
  event(
    m,
    "escrow_result_requested",
    "Verified deliverable hash queued for on-chain submission; release awaits the dispute window",
    job.id,
  );
}
export async function requestEscrowRefund(m: Mission, p: Payment) {
  if (
    !p.escrow?.blockchainIdentifier ||
    p.escrow.state === "refunded" ||
    p.escrow.state === "released" ||
    p.escrow.state === "refund_pending"
  )
    throw new Error("Escrow is not refundable in this state");
  p.escrow.state = "refund_pending";
  save(m);
  await nodeRequest(
    "/purchase/request-refund",
    { network: "Preprod", blockchainIdentifier: p.escrow.blockchainIdentifier },
    p.buyerAgentId,
  );
  event(
    m,
    "escrow_refund_requested",
    "Buyer refund requested; seller authorization must wait for the on-chain request. Budget remains spent until confirmed return",
    p.jobId,
  );
}
export async function authorizeEscrowRefund(m: Mission, p: Payment) {
  const e = p.escrow;
  if (!e?.blockchainIdentifier || e.state !== "refund_pending")
    throw new Error("Request and reconcile the buyer refund first");
  if (e.refundAuthorizationRequested)
    throw new Error(
      "Seller authorization was already attempted; reconcile before any further action",
    );
  const record = await findPayment(e.blockchainIdentifier);
  validateEscrowRecord(p, record, "RequestedFunds");
  const quote = escrowRecordSchema.parse(e.quote);
  if (
    record.SmartContractWallet?.walletAddress !==
      quote.SmartContractWallet?.walletAddress ||
    !["RefundRequested", "Disputed"].includes(record.onChainState || "") ||
    record.NextAction.requestedAction !== "WaitingForExternalAction" ||
    record.CurrentTransaction?.status !== "Confirmed" ||
    !record.CurrentTransaction.txHash ||
    (record.CurrentTransaction.confirmations || 0) < 1
  )
    throw new Error(
      "Seller must observe a confirmed on-chain refund request before authorization",
    );
  e.refundAuthorizationRequested = true;
  save(m);
  await nodeRequest("/payment/authorize-refund", {
    network: "Preprod",
    blockchainIdentifier: e.blockchainIdentifier,
  });
  event(
    m,
    "escrow_refund_authorized",
    "Local seller authorization queued after confirmed refund request; return still awaits confirmation",
    p.jobId,
  );
}
export async function reconcileEscrow(m: Mission, p: Payment) {
  if (!p.escrow?.blockchainIdentifier)
    throw new Error(
      "Escrow quote/purchase is uncertain. Inspect node records before taking action",
    );
  const e = p.escrow;
  const record = await findPurchase(e.blockchainIdentifier!, p.buyerAgentId);
  if (p.status === "submitted" && record.onChainState !== "RefundWithdrawn") {
    await observeLock(m, p, await checkBuyerScope(p.buyerAgentId));
    return;
  }
  validateEscrowRecord(p, record, "PaidFunds");
  if (
    ["ResultSubmitted", "Withdrawn", "RefundWithdrawn"].includes(
      record.onChainState || "",
    ) &&
    (record.CurrentTransaction?.status !== "Confirmed" ||
      !record.CurrentTransaction.txHash ||
      (record.CurrentTransaction.confirmations || 0) < 1)
  )
    throw new Error("Escrow transition lacks confirmed transaction evidence");
  if (record.onChainState === "ResultSubmitted") {
    if (!e.resultHash || record.resultHash !== e.resultHash)
      throw new Error("On-chain escrow result hash mismatch");
    if (e.state !== "refund_pending") e.state = "result_submitted";
  } else if (record.onChainState === "Withdrawn") {
    if (!e.resultHash || record.resultHash !== e.resultHash)
      throw new Error("Released escrow result hash mismatch");
    e.state = "released";
  } else if (record.onChainState === "RefundWithdrawn") {
    const buyer = buyerSigner(p.buyerAgentId).getAddress();
    const response = await fetch(
      `https://cardano-preprod.blockfrost.io/api/v0/txs/${record.CurrentTransaction!.txHash}/utxos`,
      {
        headers: { project_id: process.env.BLOCKFROST_PROJECT_ID || "" },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new Error("Refund transaction is not independently visible");
    const output = z
      .object({
        outputs: z.array(
          z.object({
            address: z.string(),
            amount: z.array(
              z.object({
                unit: z.string(),
                quantity: z.string().regex(/^\d+$/),
              }),
            ),
          }),
        ),
      })
      .parse(await response.json());
    const returned = output.outputs
      .filter((o) => o.address === buyer)
      .reduce(
        (sum, o) =>
          sum +
          o.amount
            .filter((a) => a.unit === USDM_PREPROD_ASSET.replace(".", ""))
            .reduce((value, a) => value + BigInt(a.quantity), 0n),
        0n,
      );
    if (returned < BigInt(units(p.amount)))
      throw new Error(
        "Confirmed refund did not return the mission asset to its buyer",
      );
    e.state = "refunded";
    if (!e.refundCredited) {
      if (p.status === "submitted") release(m, p.amount);
      else m.budget.spent = (units(m.budget.spent) - units(p.amount)) / 1e6;
      e.refundCredited = true;
      recalculate(m);
    }
    p.status = "confirmed";
    p.buyerAddress = buyer;
    e.refundTxHash = record.CurrentTransaction!.txHash!;
  }
  save(m);
  event(
    m,
    "escrow_reconciled",
    `Masumi on-chain state: ${record.onChainState || "pending"} · escrow ${e.state}`,
    p.jobId,
  );
}
