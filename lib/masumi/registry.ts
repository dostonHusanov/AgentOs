import { z } from "zod";
import { USDM_PREPROD_ASSET } from "@x402/cardano";
import type { AgentDefinition } from "@/types/agent";
import {
  nodeRequest,
  MASUMI_SOURCE_VERSION,
  transactionSchema,
} from "./client";
const sourceSchema = z.object({
  chain: z.literal("Cardano"),
  network: z.literal("Preprod"),
  paymentSourceType: z.literal(MASUMI_SOURCE_VERSION),
  address: z.string().startsWith("addr_test1"),
  pricing: z.object({
    pricingType: z.literal("Fixed"),
    fixed: z.array(
      z.object({ asset: z.string(), amount: z.string().regex(/^\d+$/) }),
    ),
  }),
});
const entrySchema = z.object({
  id: z.string(),
  agentIdentifier: z.string().min(57).nullable(),
  state: z.string(),
  name: z.string(),
  apiBaseUrl: z.string().nullable(),
  Capability: z.object({ name: z.string().nullable() }),
  supportedPaymentSources: z.array(z.unknown()).nullable(),
  SmartContractWallet: z.object({
    walletAddress: z.string(),
    walletVkey: z.string(),
  }),
  RecipientWallet: z
    .object({ walletAddress: z.string(), walletVkey: z.string() })
    .nullable(),
  CurrentTransaction: transactionSchema.nullable(),
});
export type RegistryEntry = z.infer<typeof entrySchema>;
export function mapNativeEntry(
  entry: RegistryEntry,
  local: AgentDefinition,
  identifier: string,
): AgentDefinition {
  if (
    entry.state !== "RegistrationConfirmed" ||
    entry.agentIdentifier !== identifier ||
    entry.apiBaseUrl !== local.endpoint ||
    entry.Capability.name !== local.capabilities[0]
  )
    throw new Error(
      `Masumi identity/endpoint/capability mismatch for ${local.id}`,
    );
  const owner = entry.RecipientWallet || entry.SmartContractWallet;
  const expectedOwner =
    process.env[
      `MASUMI_${local.id.replaceAll("-", "_").toUpperCase()}_SELLER_ADDRESS`
    ] || local.walletAddress;
  if (owner.walletAddress !== expectedOwner)
    throw new Error(`Masumi seller wallet mismatch for ${local.id}`);
  const matches = (entry.supportedPaymentSources || []).flatMap(
    (source, index) => {
      const parsed = sourceSchema.safeParse(source);
      return parsed.success ? [{ source: parsed.data, index }] : [];
    },
  );
  const selected = matches.find(
    ({ source }) =>
      source.pricing.fixed.length === 1 &&
      source.pricing.fixed[0].asset === USDM_PREPROD_ASSET.replace(".", ""),
  );
  if (!selected)
    throw new Error(`Masumi Preprod tUSDM V2 source missing for ${local.id}`);
  const atomic = BigInt(selected.source.pricing.fixed[0].amount);
  if (atomic <= 0n || atomic > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Invalid native registry price");
  return {
    ...local,
    name: entry.name,
    pricing: { amount: Number(atomic) / 1e6, asset: "tUSDM" },
    registryId: identifier,
    source: "masumi",
    masumi: {
      contractAddress: selected.source.address,
      sourceIndex: selected.index,
      sellerVkey: owner.walletVkey,
      sellerAddress: owner.walletAddress,
    },
  };
}
export async function discoverNativeAgents(locals: AgentDefinition[]) {
  const bindings = z
    .record(z.string(), z.string().min(57))
    .parse(JSON.parse(process.env.MASUMI_AGENT_IDS || "{}"));
  if (!Object.keys(bindings).length)
    throw new Error(
      "MASUMI_AGENT_IDS must map local seller IDs to confirmed Masumi identifiers",
    );
  const result: AgentDefinition[] = [];
  for (const [id, identifier] of Object.entries(bindings)) {
    const local = locals.find((a) => a.id === id);
    if (!local) throw new Error(`Unsupported Masumi agent binding: ${id}`);
    const query = new URLSearchParams({
      network: "Preprod",
      filterAgentIdentifier: identifier,
      filterStatus: "Registered",
      limit: "2",
    });
    const data = z
      .object({ Assets: z.array(entrySchema) })
      .parse(await nodeRequest(`/registry?${query}`));
    if (data.Assets.length !== 1)
      throw new Error(`Masumi identity ${id} is missing or ambiguous`);
    result.push(mapNativeEntry(data.Assets[0], local, identifier));
  }
  return result;
}
