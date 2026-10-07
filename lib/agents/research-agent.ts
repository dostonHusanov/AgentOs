import type { Mission, Job } from "@/types/mission";
import { geminiResearch } from "@/lib/ai/research";
import { event } from "@/lib/mission/store";
export type Hire = (capability: string, objective: string) => Promise<unknown>;
export async function research(
  m: Mission,
  job: Job,
  hire: Hire,
  context?: unknown,
) {
  if (m.aiMode === "fixture") {
    event(
      m,
      "sub_agent_discovered",
      "Fixture research provider requests structured_city_data",
      job.id,
    );
    const data = await hire("structured_city_data", job.objective);
    return {
      summary:
        "This fixture comparison evaluates Kuala Lumpur, Bangkok, and Da Nang for a month of remote software development. Da Nang offers the lowest illustrative living cost, while Kuala Lumpur provides a strong balance of internet infrastructure and coworking availability. These are controlled demo figures and require current source verification before making a travel decision.",
      findings: [
        "Da Nang: illustrative $900/month and internet score 8/10; verify housing and connection quality.",
        "Kuala Lumpur: illustrative $1,200/month, internet 9/10, and coworking 9/10.",
        "Bangkok: illustrative $1,300/month and coworking 10/10; offers the broadest coworking selection in this fixture.",
      ],
      sources: [],
      purchasedData: data,
    };
  }
  return geminiResearch(m, job, hire, undefined, undefined, context);
}
