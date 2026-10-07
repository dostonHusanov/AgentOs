import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { setLocalValues } from "./local-config";
loadEnvConfig(process.cwd());
async function main() {
  process.env.MASUMI_NODE_URL ||= "http://127.0.0.1:3002/api/v1";
  const { nodeRequest, nodeConfig } = await import("../lib/masumi/client");
  const { checkBuyerScope } = await import("../lib/masumi/escrow");
  const { buyerSigner } = await import("../lib/cardano/wallet");
  for (const id of ["manager", "research", "research-backup"])
    await checkBuyerScope(id);
  const url = new URL(nodeConfig().base);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error(
      "Wallet import is limited to your local Masumi node; configure a hosted node separately",
    );
  const sources = z
    .object({
      PaymentSources: z.array(
        z.object({
          id: z.string(),
          network: z.string(),
          paymentSourceType: z.string(),
        }),
      ),
    })
    .parse(await nodeRequest("/payment-source?network=Preprod"));
  const source = sources.PaymentSources.find(
    (s) => s.network === "Preprod" && s.paymentSourceType === "Web3CardanoV2",
  );
  if (!source) throw new Error("Canonical Preprod V2 source missing");
  const address = buyerSigner("research-backup").getAddress();
  const list = z
    .object({
      Wallets: z.array(
        z.object({ walletAddress: z.string(), paymentSourceId: z.string() }),
      ),
    })
    .parse(await nodeRequest("/wallet/list?walletType=Selling&take=100"));
  if (
    !list.Wallets.some(
      (w) => w.walletAddress === address && w.paymentSourceId === source.id,
    )
  ) {
    await nodeRequest(
      "/payment-source-extended",
      {
        id: source.id,
        AddSellingWallets: [
          {
            walletMnemonic: process.env.RESEARCH_BACKUP_MNEMONIC,
            collectionAddress: address,
            note: "AgentOS backup research seller",
          },
        ],
      },
      undefined,
      "PATCH",
    );
    console.log(
      "Backup selling wallet imported into the local node's encrypted storage. Secret withheld.",
    );
  }
  console.log(
    "Buyer wallet identities verified; seller wallets prepared. No purchase or registration was submitted. Next: npm run agents:register -- --submit",
  );
}
main().catch(async (error) => {
  const { errorSummary } = await import("../lib/errors");
  console.error(errorSummary(error));
  process.exitCode = 1;
});
