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
  masumi?: {
    contractAddress: string;
    sourceIndex: number;
    sellerVkey: string;
    sellerAddress: string;
  };
  source: "local" | "masumi";
}
