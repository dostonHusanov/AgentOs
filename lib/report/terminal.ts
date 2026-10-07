import type { PublicMission, Report } from "../../types/mission";

/** Export terminal outcomes without changing execution or verification status. */
export function terminalReport(m: PublicMission): Report | undefined {
  if (m.status === "completed") return m.result;
  if (m.status !== "failed") return undefined;
  const evidence: string[] = [];
  const comparison: Report["comparison"] = [];
  for (const job of m.jobs) {
    const accepted = job.status === "completed";
    const label = accepted
      ? "Passed individual checks; overall mission failed"
      : "Rejected or incomplete; unverified";
    const value = job.result;
    if (value && typeof value === "object") {
      const r = value as Record<string, unknown>;
      if (typeof r.summary === "string")
        evidence.push(`${job.sellerName} [${label}]: ${r.summary}`);
      if (Array.isArray(r.findings))
        for (const finding of r.findings)
          if (typeof finding === "string")
            evidence.push(`${job.sellerName} [${label}]: ${finding}`);
    }
    comparison.push({
      option: job.sellerName || job.sellerAgentId,
      assessment: `${label}. Task: ${job.objective}${job.error ? ` Failure: ${job.error}` : ""}`,
    });
  }
  return {
    title: "Partial report - mission failed",
    recommendation:
      "This is the final record of an unsuccessful mission, not an approved investment recommendation. Use the available findings only as preliminary leads. Resolve the missing coverage and verify claims before making a decision.",
    comparison,
    evidence: evidence.length
      ? evidence
      : [
          "No readable research findings were retained. Payment receipts and execution events are included below.",
        ],
    limitations: [
      "The requested work did not pass overall verification. Individual checks do not independently establish factual accuracy.",
      m.error ?? "See recorded provider failures for missing coverage.",
      "Rejected outputs are explicitly marked unverified. No additional research, purchases or replacement mission were started to produce this report.",
    ],
  };
}
