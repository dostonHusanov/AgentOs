import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { USDM_PREPROD_ASSET } from "@x402/cardano";
import { setLocalValues } from "./local-config";
loadEnvConfig(process.cwd());
async function main() {
  const { localAgents } = await import("../lib/agents/discovery");
  if (!process.argv.includes("--submit")) {
    console.log(JSON.stringify(localAgents(), null, 2));
    console.log(
      "Metadata export only. Run npm run agents:register -- --submit after Masumi node/wallet setup to request real Preprod registration.",
    );
    return;
  }
  process.env.MASUMI_NODE_URL ||= "http://127.0.0.1:3002/api/v1";
  const { nodeRequest } = await import("../lib/masumi/client");
  const { units } = await import("../lib/mission/policies");
  const wallets = z
    .object({
      Wallets: z.array(
        z.object({
          id: z.string(),
          walletAddress: z.string(),
          walletVkey: z.string(),
          paymentSourceId: z.string(),
        }),
      ),
    })
    .parse(await nodeRequest("/wallet/list?walletType=Selling&take=100"));
  const sources = z
    .object({
      PaymentSources: z.array(
        z.object({
          id: z.string(),
          network: z.string(),
          paymentSourceType: z.string(),
          smartContractAddress: z.string(),
        }),
      ),
    })
    .parse(await nodeRequest("/payment-source?network=Preprod"));
  const source = sources.PaymentSources.find(
    (s) => s.network === "Preprod" && s.paymentSourceType === "Web3CardanoV2",
  );
  if (!source)
    throw new Error(
      "Masumi canonical Preprod V2 payment source not configured",
    );
  const root = join(process.cwd(), ".agentos", "registrations");
  mkdirSync(root, { recursive: true });
  const bindings: Record<string, string> = {},
    settings: Record<string, string> = {};
  for (const agent of localAgents().filter(
    (a) => a.id !== "research-premium",
  )) {
    const owner =
      agent.id === "research-backup"
        ? process.env.RESEARCH_BACKUP_WALLET_ADDRESS
        : process.env.RESEARCH_WALLET_ADDRESS;
    const wallet = wallets.Wallets.find(
      (w) => w.walletAddress === owner && w.paymentSourceId === source.id,
    );
    if (!wallet)
      throw new Error(
        `Import the ${agent.id === "research-backup" ? "backup" : "research"} selling wallet into the seller node before registration`,
      );
    settings[
      `MASUMI_${agent.id.replaceAll("-", "_").toUpperCase()}_SELLER_ADDRESS`
    ] = wallet.walletAddress;
    const file = join(root, `${agent.id}.json`);
    if (!existsSync(file)) {
      const body = {
        network: "Preprod",
        type: "Standard",
        sellingWalletVkey: wallet.walletVkey,
        name: agent.name,
        description: agent.description,
        apiBaseUrl: agent.endpoint,
        ExampleOutputs: [],
        Tags: ["agentos", agent.capabilities[0]],
        Capability: { name: agent.capabilities[0], version: "1.0.0" },
        Author: { name: "AgentOS", organization: "AgentOS" },
        supportedPaymentSources: [
          {
            chain: "Cardano",
            network: "Preprod",
            paymentSourceType: "Web3CardanoV2",
            address: source.smartContractAddress,
            pricing: {
              pricingType: "Fixed",
              fixed: [
                {
                  asset: USDM_PREPROD_ASSET.replace(".", ""),
                  amount: String(units(agent.pricing.amount)),
                },
              ],
            },
          },
        ],
      };
      writeFileSync(file, JSON.stringify({ state: "intent", body }), {
        flag: "wx",
        mode: 0o600,
      });
      const response = z
        .object({ id: z.string(), state: z.string() })
        .parse(await nodeRequest("/registry", body));
      writeFileSync(
        file,
        JSON.stringify({ state: "submitted", id: response.id, body }),
        { mode: 0o600 },
      );
      console.log(
        `${agent.name}: registration ${response.state}; confirmation pending.`,
      );
    }
    const saved = z
      .object({ id: z.string().optional() })
      .parse(JSON.parse(readFileSync(file, "utf8")));
    if (!saved.id)
      throw new Error(
        `${agent.id} registration response was uncertain. Reconcile node records before retrying; no duplicate registration was requested`,
      );
    let cursor: string | undefined;
    let found:
      | {
          id: string;
          agentIdentifier: string | null;
          state: string;
          apiBaseUrl: string | null;
        }
      | undefined;
    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({
        network: "Preprod",
        filterPaymentSourceType: "Web3CardanoV2",
        limit: "100",
        ...(cursor ? { cursorId: cursor } : {}),
      });
      const data = z
        .object({
          Assets: z.array(
            z.object({
              id: z.string(),
              agentIdentifier: z.string().nullable(),
              state: z.string(),
              apiBaseUrl: z.string().nullable(),
            }),
          ),
        })
        .parse(await nodeRequest(`/registry?${query}`));
      found = data.Assets.find((a) => a.id === saved.id);
      if (found || data.Assets.length < 100) break;
      cursor = data.Assets.at(-1)!.id;
    }
    if (
      found?.state === "RegistrationConfirmed" &&
      found.agentIdentifier &&
      found.apiBaseUrl === agent.endpoint
    )
      bindings[agent.id] = found.agentIdentifier;
    else
      console.log(
        `${agent.id}: not confirmed yet; re-run this command to observe the existing registration.`,
      );
  }
  setLocalValues(settings);
  if (Object.keys(bindings).length !== 4) {
    console.log(
      "Registrations remain pending. Native discovery was not enabled.",
    );
    return;
  }
  setLocalValues({
    MASUMI_NODE_URL: process.env.MASUMI_NODE_URL,
    MASUMI_AGENT_IDS: JSON.stringify(bindings),
  });
  console.log(
    "Four confirmed native Masumi identities saved. Restart AgentOS; escrow remains disabled until node checks pass.",
  );
}
main().catch(async (error) => {
  const { errorSummary } = await import("../lib/errors");
  console.error(errorSummary(error));
  process.exitCode = 1;
});
