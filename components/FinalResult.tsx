import type { PublicMission } from "@/types/mission";
import { Check, ArrowUpRight } from "lucide-react";
export function FinalResult({ mission: m }: { mission: PublicMission }) {
  if (!m.result) return null;
  return (
    <section className="panel final-result">
      <div className="result-label">
        <Check size={17} /> MISSION COMPLETE
      </div>
      <h2>{m.result.title}</h2>
      <p className="recommendation">{m.result.recommendation}</p>
      <div className="result-metrics">
        <span>
          <strong>
            {m.jobs.filter((j) => j.status === "completed").length}
          </strong>{" "}
          agents completed
        </span>
        <span>
          <strong>
            {
              m.jobs.filter((j) => j.parentJobId && j.status === "completed")
                .length
            }
          </strong>{" "}
          nested hires
        </span>
        <span>
          <strong>
            {m.payments.filter((p) => p.status === "confirmed").length}
          </strong>{" "}
          real transactions
        </span>
        <span>
          <strong>{m.budget.spent.toFixed(2)}</strong> tUSDM spent
        </span>
      </div>
      <div className="comparison-list">
        {m.result.comparison.map((c, i) => (
          <div key={i}>
            <strong>{c.option}</strong>
            <p>{c.assessment}</p>
          </div>
        ))}
      </div>
      <h3>Evidence & limitations</h3>
      {m.result.evidence.map((e, i) => (
        <p key={i} className="evidence">
          {e}
        </p>
      ))}
      {m.result.limitations.map((e, i) => (
        <p key={i} className="limitation">
          {e}
        </p>
      ))}
      <button
        className="secondary-button"
        onClick={() => {
          const blob = new Blob([JSON.stringify(m, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `agentos-${m.id}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        Export mission & receipts <ArrowUpRight size={14} />
      </button>
    </section>
  );
}
