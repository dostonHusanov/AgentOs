import type { PublicMission } from "@/types/mission";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export function reportHtml(m: PublicMission): string {
  const r = m.result;
  if (!r) throw new Error("The report is not available yet.");
  const paragraph = (text: string) => `<p>${escapeHtml(text)}</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(r.title)}</title><style>
@page { size: A4; margin: 20mm; }
body { font: 12pt/1.6 Georgia, serif; color: #172525; max-width: 760px; margin: 32px auto; padding: 0 24px; }
h1 { font: bold 25pt/1.2 Arial, sans-serif; } h2 { font: bold 16pt Arial, sans-serif; margin-top: 28px; }
h1,h2,h3 { break-after: avoid; } p { white-space: pre-wrap; overflow-wrap: anywhere; }
.meta { font: 10pt/1.6 Arial, sans-serif; color: #536565; }
button { padding: 12px 20px; cursor: pointer; } .toolbar { font: 11pt Arial, sans-serif; border-bottom: 1px solid #ccc; padding-bottom: 20px; }
@media print { .toolbar { display: none; } body { margin: 0; padding: 0; max-width: none; } }
</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><p>Choose “Save as PDF” as the destination in the print dialog.</p></div>
<div class="meta">AgentOS · Mission report</div><h1>${escapeHtml(r.title)}</h1>
<div class="meta">Mission: ${escapeHtml(m.id)}<br>Created: ${escapeHtml(m.createdAt)}<br>Status: ${escapeHtml(m.status)} · Spent: ${m.budget.spent.toFixed(2)} tUSDM</div>
<h2>Mission brief</h2>${paragraph(m.goal)}
<h2>Recommendation</h2>${paragraph(r.recommendation)}
<h2>Comparison</h2>${r.comparison.map((c) => `<h3>${escapeHtml(c.option)}</h3>${paragraph(c.assessment)}`).join("")}
<h2>Evidence</h2>${r.evidence.map(paragraph).join("")}
<h2>Limitations</h2>${r.limitations.length ? r.limitations.map(paragraph).join("") : paragraph("No limitations were recorded in the report.")}
<h2>Payment receipts</h2>${m.payments.map((p) => paragraph(`${p.amount.toFixed(2)} ${p.asset} · ${p.buyerAgentId} → ${p.sellerAgentId}\n${p.network} · ${p.mode} · ${p.status}${p.escrow ? ` · Escrow: ${p.escrow.state}` : ""}\nTransaction: ${p.txHash || "Not recorded"}${p.escrow?.refundTxHash ? `\nRefund transaction: ${p.escrow.refundTxHash}` : ""}`)).join("")}
</body></html>`;
}

export function openReportPrint(m: PublicMission) {
  const report = window.open("", "_blank");
  if (!report) {
    window.alert("Allow pop-ups for this site to open the PDF report.");
    return;
  }
  report.opener = null;
  report.document.open();
  report.document.write(reportHtml(m));
  report.document.close();
}
