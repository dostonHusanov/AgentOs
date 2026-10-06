export type MissionStatus =
  | "created"
  | "planning"
  | "discovering"
  | "selecting"
  | "purchasing"
  | "executing"
  | "verifying"
  | "synthesizing"
  | "completed"
  | "failed";
export type JobStatus =
  | "pending"
  | "discovering"
  | "provider_selected"
  | "payment_required"
  | "paying"
  | "paid"
  | "executing"
  | "verifying"
  | "completed"
  | "failed";
export interface SpendingPolicy {
  maxSinglePurchase: number;
  minimumReputation: number;
  escrowThreshold: number;
  allowedCapabilities?: string[];
  blockedCapabilities?: string[];
}
export interface MissionBudget {
  initial: number;
  spent: number;
  reserved: number;
  remaining: number;
  asset: "tUSDM";
}
export interface Task {
  id: string;
  capability: string;
  objective: string;
  dependsOn: string[];
}
export interface Plan {
  summary: string;
  tasks: Task[];
}
export interface Job {
  id: string;
  missionId: string;
  parentJobId?: string;
  buyerAgentId: string;
  sellerAgentId: string;
  capability: string;
  objective: string;
  status: JobStatus;
  price: number;
  reason: string;
  sellerName: string;
  reputation: number;
  registrySource: "local" | "masumi";
  depth: number;
  result?: unknown;
  error?: string;
  createdAt: string;
}
export interface Payment {
  id: string;
  missionId: string;
  jobId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  amount: number;
  asset: string;
  network: string;
  txHash?: string;
  explorerUrl?: string;
  status: "reserved" | "submitted" | "confirmed" | "simulated" | "failed";
  mode: "cardano" | "simulation";
  createdAt: string;
  buyerAddress?: string;
  sellerAddress?: string;
  proofDigest?: string;
}
export interface MissionEvent {
  id: string;
  type: string;
  message: string;
  jobId?: string;
  createdAt: string;
}
export interface Report {
  title: string;
  recommendation: string;
  comparison: { option: string; assessment: string }[];
  evidence: string[];
  limitations: string[];
}
export interface Mission {
  id: string;
  accessToken: string;
  goal: string;
  status: MissionStatus;
  budget: MissionBudget;
  policy: SpendingPolicy;
  plan?: Plan;
  jobs: Job[];
  payments: Payment[];
  events: MissionEvent[];
  result?: Report;
  error?: string;
  createdAt: string;
  completedAt?: string;
  failNextProvider: boolean;
  paymentMode: "cardano" | "simulation";
  aiMode: "gemini" | "fixture";
}
export type PublicMission = Omit<Mission, "accessToken">;
