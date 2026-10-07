import { terminalReport } from "@/lib/report/terminal";
import type { PublicMission } from "@/types/mission";
import { Check, ArrowUpRight } from "lucide-react";
import { useState } from "react";
export function FinalResult({
  mission: m,
  mcpReadOnly = false,
}: {
  mission: PublicMission;
  mcpReadOnly?: boolean;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  async function downloadPdf() {
    setPdfBusy(true);
    setPdfError("");
    try {
      const token = sessionStorage.getItem(`mission:${m.id}`);
      const response = await fetch(
        mcpReadOnly
          ? `/api/mcp/missions/${m.id}/report`
          : `/api/missions/${m.id}/report`,
        {
          headers:
            !mcpReadOnly && token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `agentos-${m.id}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setPdfError(
        "Could not download the PDF. Keep the server running and try again.",
      );
    } finally {
      setPdfBusy(false);
    }
  }
  const report = terminalReport(m);
  if (!report) return null;
  return (
    <section className="panel final-result">
      <div className="result-label">
        <Check size={17} />{" "}
        {m.status === "failed"
          ? "PARTIAL REPORT - MISSION FAILED"
          : "MISSION COMPLETE"}
      </div>
      <h2>{report.title}</h2>
      <p className="recommendation">{report.recommendation}</p>
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
        {report.comparison.map((c, i) => (
          <div key={i}>
            <strong>{c.option}</strong>
            <p>{c.assessment}</p>
          </div>
        ))}
      </div>
      <h3>Evidence & limitations</h3>
      {report.evidence.map((e, i) => (
        <p key={i} className="evidence">
          {e}
        </p>
      ))}
      {report.limitations.map((e, i) => (
        <p key={i} className="limitation">
          {e}
        </p>
      ))}
      {pdfError && <p role="alert">{pdfError}</p>}
      <button
        className="secondary-button"
        disabled={pdfBusy}
        onClick={() => void downloadPdf()}
      >
        {pdfBusy ? "Preparing PDF…" : "Download report (PDF)"}{" "}
        <ArrowUpRight size={14} />
      </button>{" "}
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
        Download mission & receipts (JSON) <ArrowUpRight size={14} />
      </button>
    </section>
  );
}
