import type { Mission } from "@/types/mission";
import type { AgentDefinition } from "@/types/agent";
import { validatePurchase } from "@/lib/mission/policies";
export function evaluate(
  m: Mission,
  candidates: AgentDefinition[],
  capability: string,
  depth: number,
  ancestors: string[],
) {
  return candidates
    .map((agent) => {
      let rejection: string | undefined;
      try {
        validatePurchase(m, agent, capability, depth, ancestors);
      } catch (e) {
        rejection = e instanceof Error ? e.message : "Policy rejected";
      }
      const score =
        0.4 +
        (0.3 * agent.reputation) / 100 +
        0.2 / (1 + agent.pricing.amount) +
        0.1 * agent.reliability;
      return {
        agent,
        score,
        rejection,
        reason: `Capability match · reputation ${agent.reputation}/100 · ${agent.pricing.amount} tUSDM · score ${(score * 100).toFixed(1)}${rejection ? ` · rejected: ${rejection}` : ""}`,
      };
    })
    .sort((a, b) => b.score - a.score);
}
