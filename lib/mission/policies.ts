import type { Mission } from "@/types/mission";
import type { AgentDefinition } from "@/types/agent";
import { canEscrow } from "@/lib/masumi/escrow";
export const units = (amount: number) => Math.round(amount * 1_000_000);
export function validatePurchase(
  m: Mission,
  a: AgentDefinition,
  capability: string,
  depth: number,
  ancestors: string[],
) {
  if (depth > 3 || depth > (Number(process.env.MAX_AGENT_DEPTH) || 3))
    throw new Error("Maximum agent depth exceeded");
  if (ancestors.includes(a.id)) throw new Error("Agent hiring cycle rejected");
  if (a.status !== "online" || !a.capabilities.includes(capability))
    throw new Error("Provider unavailable or capability mismatch");
  if (a.pricing.asset !== m.budget.asset) throw new Error("Asset mismatch");
  if (!Number.isFinite(a.pricing.amount) || a.pricing.amount <= 0)
    throw new Error("Invalid price");
  if (units(a.pricing.amount) > units(m.budget.remaining))
    throw new Error("Insufficient mission budget");
  if (a.pricing.amount > m.policy.maxSinglePurchase)
    throw new Error("Single purchase limit exceeded");
  if (a.reputation < m.policy.minimumReputation)
    throw new Error("Reputation below policy");
  if (
    m.policy.blockedCapabilities?.includes(capability) ||
    (m.policy.allowedCapabilities &&
      !m.policy.allowedCapabilities.includes(capability))
  )
    throw new Error("Capability blocked by policy");
  if (
    a.pricing.amount > m.policy.escrowThreshold &&
    (m.paymentMode !== "cardano" || !canEscrow(a))
  )
    throw new Error("Escrow required by policy; escrow is not configured");
}
export function reserve(m: Mission, amount: number) {
  if (units(amount) > units(m.budget.remaining))
    throw new Error("Insufficient mission budget");
  m.budget.reserved = (units(m.budget.reserved) + units(amount)) / 1e6;
  recalculate(m);
}
export function recalculate(m: Mission) {
  m.budget.remaining =
    (units(m.budget.initial) -
      units(m.budget.spent) -
      units(m.budget.reserved)) /
    1e6;
}
export function settleBudget(m: Mission, amount: number) {
  m.budget.reserved = (units(m.budget.reserved) - units(amount)) / 1e6;
  m.budget.spent = (units(m.budget.spent) + units(amount)) / 1e6;
  recalculate(m);
}
export function release(m: Mission, amount: number) {
  m.budget.reserved = (units(m.budget.reserved) - units(amount)) / 1e6;
  recalculate(m);
}
