import type { Mission, Plan } from "@/types/mission";
import { structured } from "@/lib/ai/client";
import { planSchema } from "@/lib/ai/schemas";
import { discoverAgents } from "@/lib/agents/discovery";
import { evaluate } from "@/lib/agents/evaluator";
import { units } from "./policies";
import type { AgentDefinition } from "@/types/agent";
export function validatePlanBudget(
  m: Mission,
  p: Plan,
  catalog: AgentDefinition[],
) {
  const capabilities = p.tasks.map((t) => t.capability);
  if (!capabilities.includes("report_generation"))
    capabilities.push("report_generation");
  const estimate = capabilities.reduce((total, capability) => {
    const selected = evaluate(
      m,
      catalog.filter((a) => a.capabilities.includes(capability)),
      capability,
      1,
      ["manager"],
    ).find((a) => !a.rejection);
    if (!selected)
      throw new Error(`No policy-eligible provider for ${capability}`);
    return total + units(selected.agent.pricing.amount);
  }, 0);
  if (estimate > units(m.budget.remaining))
    throw new Error(
      `Plan requires at least ${estimate / 1e6} tUSDM at current provider selection; only ${m.budget.remaining} is available`,
    );
}
export async function planMission(m: Mission): Promise<Plan> {
  const catalog = await discoverAgents();
  if (m.aiMode === "fixture")
    return {
      summary:
        "Fixture demo: research, specialist data purchase, and final synthesis",
      tasks: [
        {
          id: "research",
          capability: "web_research",
          objective: m.goal,
          dependsOn: [],
        },
        {
          id: "report",
          capability: "report_generation",
          objective: `Produce a comparison and recommendation answering: ${m.goal}`,
          dependsOn: ["research"],
        },
      ],
    };
  const instruction =
    "You are a mission manager. Create a minimal dependency DAG for the goal using ONLY available capabilities. Prefer one combined web_research task covering all requested criteria, followed by one report_generation task. Combine related questions instead of paying for a research task per criterion. The whole plan must fit the available budget, leaving headroom for specialist purchases or recovery. Do not create city data tasks directly: specialist providers may buy data themselves. No hidden reasoning, only a concise summary.";
  const context = {
    goal: m.goal,
    budget: m.budget,
    providers: catalog.map((a) => ({
      capabilities: a.capabilities,
      price: a.pricing,
    })),
  };
  let p = await structured(
    planSchema,
    "mission_plan",
    instruction,
    JSON.stringify(context),
  );
  try {
    validatePlanBudget(m, p, catalog);
  } catch (error) {
    p = await structured(
      planSchema,
      "mission_plan",
      instruction,
      JSON.stringify({
        ...context,
        correction:
          error instanceof Error ? error.message : "Plan is not affordable",
      }),
    );
    validatePlanBudget(m, p, catalog);
  }
  const ids = new Set<string>();
  for (const t of p.tasks) {
    if (ids.has(t.id) || t.dependsOn.some((d) => !ids.has(d)))
      throw new Error("Plan must have unique IDs and topological dependencies");
    if (!catalog.some((a) => a.capabilities.includes(t.capability)))
      throw new Error("Plan requested unavailable capability");
    ids.add(t.id);
  }
  return p;
}
