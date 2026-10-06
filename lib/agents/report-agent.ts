import type { Mission, Job } from "@/types/mission";
import { structured } from "@/lib/ai/client";
import { reportSchema } from "@/lib/ai/schemas";
export async function report(m: Mission, job: Job, context: unknown) {
  if (m.aiMode === "fixture")
    return {
      title: "A month of remote work in Southeast Asia",
      recommendation:
        "Da Nang is the best value in this illustrative dataset: its $900 monthly estimate leaves more room for accommodation and coworking, with strong safety and adequate internet scores. Choose Kuala Lumpur if connectivity and coworking variety matter more than the lowest cost. Verify current accommodation prices, visa eligibility, and internet reliability before booking.",
      comparison: [
        {
          option: "Da Nang",
          assessment:
            "$900/month · internet 8/10 · safety 9/10 · coworking 7/10. Best illustrative value.",
        },
        {
          option: "Kuala Lumpur",
          assessment:
            "$1,200/month · internet 9/10 · safety 8/10 · coworking 9/10. Balanced infrastructure.",
        },
        {
          option: "Bangkok",
          assessment:
            "$1,300/month · internet 9/10 · safety 8/10 · coworking 10/10. Strong coworking selection.",
        },
      ],
      evidence: [
        "Research provider findings and its purchased illustrative DataHub dataset.",
      ],
      limitations: [
        "AI fixture mode: this report is a controlled demo, not live research.",
        "Costs and scores are illustrative; no live source verification occurred.",
      ],
    };
  return structured(
    reportSchema,
    "final_report",
    "Create an evidence-grounded deliverable answering the objective. Compare options, recommend one, reference supplied research and source URLs, and disclose uncertainty and illustrative data. Do not invent citations or facts.",
    JSON.stringify({ objective: job.objective, context }),
  );
}
