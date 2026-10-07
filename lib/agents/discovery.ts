import { z } from "zod";
import type { AgentDefinition } from "@/types/agent";
import { config } from "@/lib/config";
import { discoverNativeAgents } from "@/lib/masumi/registry";
export function localAgents(): AgentDefinition[] {
  return [
    {
      id: "research",
      name: "ResearchPro",
      description: "Source-backed research. Can commission specialist data.",
      capabilities: ["web_research"],
      pricing: { amount: 1, asset: "tUSDM" },
      reputation: 95,
      reliability: 0.97,
      status: "online",
      walletAddress: process.env.RESEARCH_WALLET_ADDRESS,
    },
    {
      id: "research-backup",
      name: "Scout Research",
      description: "Independent alternative research provider.",
      capabilities: ["web_research"],
      pricing: { amount: 0.85, asset: "tUSDM" },
      reputation: 88,
      reliability: 0.9,
      status: "online",
      walletAddress: process.env.RESEARCH_BACKUP_WALLET_ADDRESS,
    },
    {
      id: "research-premium",
      name: "DeepScope",
      description: "Premium research provider, subject to escrow policy.",
      capabilities: ["web_research"],
      pricing: { amount: 2.4, asset: "tUSDM" },
      reputation: 98,
      reliability: 0.99,
      status: "online",
      walletAddress: process.env.RESEARCH_WALLET_ADDRESS,
    },
    {
      id: "data",
      name: "DataHub",
      description:
        "Controlled Southeast Asia city dataset. Illustrative, not current market data.",
      capabilities: ["structured_city_data"],
      pricing: { amount: 0.2, asset: "tUSDM" },
      reputation: 92,
      reliability: 0.99,
      status: "online",
      walletAddress: process.env.DATA_WALLET_ADDRESS,
    },
    {
      id: "report",
      name: "Synthesis",
      description: "Evidence-grounded comparisons and final deliverables.",
      capabilities: ["report_generation"],
      pricing: { amount: 0.5, asset: "tUSDM" },
      reputation: 97,
      reliability: 0.98,
      status: "online",
      walletAddress: process.env.REPORT_WALLET_ADDRESS,
    },
  ].map(
    (a) =>
      ({
        ...a,
        endpoint: `${config().appUrl}/api/agents/${a.id}/execute`,
        source: "local",
      }) as AgentDefinition,
  );
}
const metadata = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  capabilities: z.array(z.string()),
  endpoint: z.url(),
  pricing: z.object({
    amount: z.number().positive(),
    asset: z.literal("tUSDM"),
  }),
  reputation: z.number().min(0).max(100),
  reliability: z.number().min(0).max(1),
  status: z.enum(["online", "offline"]),
  walletAddress: z.string().optional(),
  registryId: z.string().optional(),
});
// Configured URL must expose normalized AgentOS metadata. Native node schemas vary;
// never infer reputation, payment addresses, or compatibility from unknown fields.
export async function discoverAgents(
  capability?: string,
): Promise<AgentDefinition[]> {
  if (process.env.MASUMI_NODE_URL) {
    const agents = await discoverNativeAgents(localAgents());
    return agents.filter(
      (a) => !capability || a.capabilities.includes(capability),
    );
  }
  if (process.env.MASUMI_REGISTRY_URL) {
    const response = await fetch(process.env.MASUMI_REGISTRY_URL, {
      headers: { Authorization: `Bearer ${process.env.MASUMI_API_KEY ?? ""}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        `Masumi registry unavailable (${response.status}); local fallback not silently enabled`,
      );
    const agents = z
      .array(metadata)
      .parse(await response.json())
      .map((a) => ({ ...a, source: "masumi" as const }));
    return agents.filter(
      (a) => !capability || a.capabilities.includes(capability),
    );
  }
  return localAgents().filter(
    (a) => !capability || a.capabilities.includes(capability),
  );
}
