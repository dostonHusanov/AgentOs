import type { Mission, Plan } from "@/types/mission";
import { structured } from "@/lib/ai/client";
import { planSchema } from "@/lib/ai/schemas";
import { discoverAgents } from "@/lib/agents/discovery";
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
  const p = await structured(
    planSchema,
    "mission_plan",
    "You are a mission manager. Create a minimal dependency DAG for the goal using ONLY available capabilities. Use web_research for evidence and report_generation for synthesis when appropriate. Do not create city data tasks directly: specialist providers may buy data themselves. No hidden reasoning, only a concise summary.",
    JSON.stringify({
      goal: m.goal,
      budget: m.budget,
      providers: catalog.map((a) => ({
        capabilities: a.capabilities,
        price: a.pricing,
      })),
    }),
  );
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
