import {
  toClientCardanoSigner,
  toFacilitatorCardanoSigner,
} from "@x402/cardano";
import { FileSettlementStore } from "./settlement-store";
import { ExactCardanoScheme } from "@x402/cardano/exact/facilitator";
export const provider = () => {
  if (!process.env.BLOCKFROST_PROJECT_ID)
    throw new Error("BLOCKFROST_PROJECT_ID required");
  return {
    blockfrost: {
      baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      projectId: process.env.BLOCKFROST_PROJECT_ID,
    },
    requestTimeoutMs: 20000,
  };
};
export function buyerSigner(id: string) {
  const prefix =
    id === "manager"
      ? "MANAGER"
      : id === "research"
        ? "RESEARCH"
        : id === "research-backup"
          ? "RESEARCH_BACKUP"
          : undefined;
  if (!prefix) throw new Error("Buyer wallet unavailable");
  const mnemonic = process.env[`${prefix}_MNEMONIC`];
  if (!mnemonic) throw new Error(`${prefix}_MNEMONIC required`);
  const signer = toClientCardanoSigner({
    mnemonic,
    network: "cardano:preprod",
    provider: provider(),
  });
  const expected = process.env[`${prefix}_WALLET_ADDRESS`];
  if (!expected || expected !== signer.getAddress())
    throw new Error(`${prefix} configured address does not match signer`);
  return signer;
}
const globalWallet = globalThis as typeof globalThis & {
  agentosFacilitator?: ExactCardanoScheme;
};
export function facilitator() {
  return (globalWallet.agentosFacilitator ??= new ExactCardanoScheme(
    toFacilitatorCardanoSigner({
      network: "cardano:preprod",
      provider: provider(),
      awaitConfirmation: false,
    }),
    {
      confirmationTimeoutMs: 45000,
      settlementStore: new FileSettlementStore(),
    },
  ));
}
