export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  endpoint: string;
  pricing: { amount: number; asset: "tUSDM" };
  reputation: number;
  reliability: number;
  status: "online" | "offline";
  walletAddress?: string;
  registryId?: string;
  source: "local" | "masumi";
}
