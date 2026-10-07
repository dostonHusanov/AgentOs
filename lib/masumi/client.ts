import { z } from "zod";
export const MASUMI_SOURCE_VERSION = "Web3CardanoV2";
export function nodeConfig(buyerId?: string) {
  const prefix = buyerId?.replaceAll("-", "_").toUpperCase();
  const base =
    (prefix && process.env[`MASUMI_${prefix}_NODE_URL`]) ||
    process.env.MASUMI_NODE_URL;
  const key =
    (prefix && process.env[`MASUMI_${prefix}_API_KEY`]) ||
    (!buyerId ? process.env.MASUMI_API_KEY : undefined);
  if (!base || !key)
    throw new Error(`Masumi ${buyerId || "seller"} node URL/API key missing`);
  const url = new URL(base);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw new Error("Masumi node must use HTTPS or loopback HTTP");
  return { base: base.replace(/\/$/, ""), key };
}
export async function nodeRequest(
  path: string,
  body?: unknown,
  buyerId?: string,
  method?: "PATCH",
): Promise<unknown> {
  const { base, key } = nodeConfig(buyerId);
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid Masumi API path");
  const response = await fetch(base + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { token: key, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  const result = z
    .object({ status: z.string(), data: z.unknown().optional() })
    .safeParse(await response.json());
  if (
    !response.ok ||
    !result.success ||
    result.data.status.toLowerCase() !== "success"
  )
    throw new Error(
      `Masumi request ${path.split("?")[0]} failed (${response.status}); check node logs`,
    );
  return result.data.data;
}
export const fundSchema = z.object({
  unit: z.string(),
  amount: z.string().regex(/^\d+$/),
});
export const transactionSchema = z.object({
  txHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  status: z.string(),
  confirmations: z.number().nullable().optional(),
});
export const escrowRecordSchema = z.object({
  id: z.string(),
  blockchainIdentifier: z.string().min(1).max(8000),
  agentIdentifier: z.string().nullable(),
  inputHash: z.string().nullable(),
  payByTime: z.string().nullable(),
  submitResultTime: z.string(),
  unlockTime: z.string(),
  externalDisputeUnlockTime: z.string(),
  onChainState: z.string().nullable(),
  resultHash: z.string().nullable(),
  sellerReturnAddress: z.string().nullable().optional(),
  NextAction: z.object({
    requestedAction: z.string(),
    errorType: z.string().nullable().optional(),
  }),
  PaymentSource: z.object({
    network: z.literal("Preprod"),
    smartContractAddress: z.string().startsWith("addr_test1"),
    paymentSourceType: z.literal(MASUMI_SOURCE_VERSION),
  }),
  SmartContractWallet: z
    .object({ walletAddress: z.string(), walletVkey: z.string() })
    .nullable(),
  RequestedFunds: z.array(fundSchema).optional(),
  PaidFunds: z.array(fundSchema).optional(),
  CurrentTransaction: transactionSchema.nullable(),
  TransactionHistory: z.array(transactionSchema).nullable().optional(),
});
export type EscrowRecord = z.infer<typeof escrowRecordSchema>;
export async function findPayment(identifier: string) {
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({
      network: "Preprod",
      filterPaymentSourceType: MASUMI_SOURCE_VERSION,
      limit: "100",
      ...(cursor ? { cursorId: cursor } : {}),
    });
    const data = z
      .object({ Payments: z.array(escrowRecordSchema) })
      .parse(await nodeRequest(`/payment?${query}`));
    const found = data.Payments.find(
      (p) => p.blockchainIdentifier === identifier,
    );
    if (found) return found;
    if (data.Payments.length < 100) break;
    cursor = data.Payments.at(-1)!.id;
  }
  throw new Error("Masumi payment not found; reconciliation required");
}
export async function findPurchase(identifier: string, buyerId: string) {
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({
      network: "Preprod",
      filterPaymentSourceType: MASUMI_SOURCE_VERSION,
      limit: "100",
      includeHistory: "true",
      ...(cursor ? { cursorId: cursor } : {}),
    });
    const data = z
      .object({ Purchases: z.array(escrowRecordSchema) })
      .parse(await nodeRequest(`/purchase?${query}`, undefined, buyerId));
    const found = data.Purchases.find(
      (p) => p.blockchainIdentifier === identifier,
    );
    if (found) return found;
    if (data.Purchases.length < 100) break;
    cursor = data.Purchases.at(-1)!.id;
  }
  throw new Error("Masumi purchase not found; reconciliation required");
}
