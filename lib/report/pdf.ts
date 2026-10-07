import PDFDocument from "pdfkit";
import { join } from "node:path";
import type { PublicMission } from "../../types/mission";

const ink = "#16312F";
const muted = "#526662";
const accent = "#087A69";
const clean = (text: string) =>
  text
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/↔/g, "<->")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

// Explicit fields only. Never serialize a mission, signing proof or escrow quote.
export function createReportPdf(
  m: PublicMission,
  root = process.cwd(),
): Promise<Buffer> {
  if (m.status !== "completed" || !m.result)
    throw new Error("Completed report required");
  const report = m.result;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 58, bottom: 62, left: 52, right: 52 },
    bufferPages: true,
    info: {
      Title: clean(report.title),
      Author: "AgentOS",
      Subject: "Mission report and public payment receipts",
    },
  });
  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("Body", join(root, "assets/fonts/NotoSans-Regular.ttf"));
  doc.registerFont("Strong", join(root, "assets/fonts/NotoSans-Bold.ttf"));
  const width = doc.page.width - 104;
  const room = (height: number) => {
    if (doc.y + height > doc.page.height - 62) doc.addPage();
  };
  const body = (text: string) => {
    doc
      .font("Body")
      .fontSize(10)
      .fillColor(ink)
      .text(clean(text), { width, lineGap: 3, paragraphGap: 7 });
    doc.moveDown(0.65);
  };
  const heading = (text: string, small = false) => {
    doc.font("Strong").fontSize(small ? 12 : 15);
    room(doc.heightOfString(clean(text), { width }) + 55);
    doc.moveDown(0.7).fillColor(accent).text(clean(text), { width });
    doc.moveDown(0.45);
  };
  doc
    .font("Strong")
    .fontSize(10)
    .fillColor(accent)
    .text("AGENTOS / MISSION REPORT");
  doc
    .moveDown(0.8)
    .fontSize(24)
    .fillColor(ink)
    .text(clean(report.title), { width, lineGap: 2 });
  doc
    .moveDown(0.6)
    .font("Body")
    .fontSize(9)
    .fillColor(muted)
    .text(
      `Mission ${m.id}\nCompleted ${m.completedAt ?? m.createdAt}\n${m.paymentMode === "cardano" ? "Cardano Preprod" : "Simulated payments"} | ${m.budget.spent.toFixed(2)} tUSDM spent | ${m.budget.remaining.toFixed(2)} remaining`,
      { width, lineGap: 3 },
    );
  heading("Recommendation");
  body(report.recommendation);
  heading("Decision overview");
  body(
    "Read the recommendation alongside the option assessments and limitations. Charts below use recorded mission values; they do not estimate business performance.",
  );
  // Vector diagram: labels are wrapped and all nodes fit on the page.
  room(116);
  const diagramY = doc.y;
  const stages = [
    "Research",
    "Compare options",
    "Review limitations",
    "Decision",
  ];
  const nodeWidth = (width - 36) / 4;
  stages.forEach((label, i) => {
    const x = 52 + i * (nodeWidth + 12);
    doc.roundedRect(x, diagramY, nodeWidth, 64, 6).fill("#EAF5F1");
    doc
      .font("Strong")
      .fontSize(10)
      .fillColor(ink)
      .text(label, x + 8, diagramY + 18, {
        width: nodeWidth - 16,
        align: "center",
      });
    if (i < stages.length - 1) {
      const start = x + nodeWidth + 2;
      doc
        .moveTo(start, diagramY + 32)
        .lineTo(start + 8, diagramY + 32)
        .strokeColor(accent)
        .lineWidth(1)
        .stroke();
      doc
        .moveTo(start + 5, diagramY + 29)
        .lineTo(start + 8, diagramY + 32)
        .lineTo(start + 5, diagramY + 35)
        .stroke();
    }
  });
  doc.x = 52;
  doc.y = diagramY + 80;
  body(
    "Decision workflow - a reading guide, not a claim that every business assumption has been independently verified.",
  );
  heading("Mission brief");
  body(m.goal);
  heading("Comparison and findings");
  room(65);
  let tableY = doc.y;
  const optionWidth = 138;
  const tableHeader = () => {
    doc.rect(52, tableY, width, 28).fill(ink);
    doc.font("Strong").fontSize(10).fillColor("#FFFFFF");
    doc.text("Option", 62, tableY + 7, { width: optionWidth - 20 });
    doc.text(
      "Assessment from the completed report",
      62 + optionWidth,
      tableY + 7,
      { width: width - optionWidth - 20 },
    );
    tableY += 28;
  };
  tableHeader();
  for (const item of report.comparison) {
    doc.font("Body").fontSize(10);
    const assessmentHeight = doc.heightOfString(clean(item.assessment), {
      width: width - optionWidth - 20,
      lineGap: 3,
    });
    doc.font("Strong");
    const optionHeight = doc.heightOfString(clean(item.option), {
      width: optionWidth - 20,
      lineGap: 3,
    });
    const height = Math.max(assessmentHeight, optionHeight) + 20;
    if (height > doc.page.height - 180) {
      // Oversized prose remains fully readable, rather than clipped in a cell.
      doc.x = 52;
      doc.y = tableY + 12;
      heading(item.option, true);
      body(item.assessment);
      room(65);
      tableY = doc.y;
      tableHeader();
      continue;
    }
    if (tableY + height > doc.page.height - 62) {
      doc.addPage();
      tableY = doc.y;
      tableHeader();
    }
    doc.rect(52, tableY, width, height).fill("#F2F6F5");
    doc
      .font("Strong")
      .fontSize(10)
      .fillColor(ink)
      .text(clean(item.option), 62, tableY + 10, {
        width: optionWidth - 20,
        lineGap: 3,
      });
    doc
      .font("Body")
      .text(clean(item.assessment), 62 + optionWidth, tableY + 10, {
        width: width - optionWidth - 20,
        lineGap: 3,
      });
    tableY += height + 4;
  }
  doc.x = 52;
  doc.y = tableY + 12;
  heading("Evidence");
  for (const evidence of report.evidence) body(evidence);
  heading("Sources");
  let sourceCount = 0;
  for (const job of m.jobs.filter(
    (j) => j.status === "completed" && j.capability === "web_research",
  )) {
    const sources = (job.result as { sources?: unknown } | undefined)?.sources;
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      if (
        !source ||
        typeof source.title !== "string" ||
        typeof source.url !== "string"
      )
        continue;
      let url: URL;
      try {
        url = new URL(source.url);
      } catch {
        continue;
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        continue;
      sourceCount++;
      body(`${sourceCount}. ${source.title}\n${source.url}`);
    }
  }
  if (!sourceCount)
    body(
      "No source URLs were recorded in the completed research deliverables. See the evidence and limitations above.",
    );
  heading("Limitations");
  for (const limitation of report.limitations) body(limitation);
  heading("Budget and payment receipts");
  room(145);
  const budgetY = doc.y;
  const budgetItems = [
    { label: "Spent", value: m.budget.spent, color: accent },
    { label: "Reserved", value: m.budget.reserved, color: "#B78636" },
    { label: "Remaining", value: m.budget.remaining, color: "#8BAFA4" },
  ];
  const total = budgetItems.reduce(
    (sum, item) => sum + Math.max(0, item.value),
    0,
  );
  let barX = 52;
  for (const item of budgetItems) {
    const barWidth = total > 0 ? (width * Math.max(0, item.value)) / total : 0;
    if (barWidth > 0) doc.rect(barX, budgetY, barWidth, 24).fill(item.color);
    barX += barWidth;
  }
  budgetItems.forEach((item, i) => {
    const x = 52 + (i * width) / 3;
    doc.rect(x, budgetY + 42, 8, 8).fill(item.color);
    doc
      .font("Strong")
      .fontSize(10)
      .fillColor(ink)
      .text(item.label, x + 14, budgetY + 38, { width: width / 3 - 18 });
    doc
      .font("Body")
      .text(`${item.value.toFixed(2)} tUSDM`, x + 14, budgetY + 56, {
        width: width / 3 - 18,
      });
  });
  doc.x = 52;
  doc.y = budgetY + 85;
  body(
    "Budget allocation - recorded mission balance. Reserved funds are not settled spending.",
  );
  const settled = m.payments.filter((p) =>
    ["confirmed", "simulated"].includes(p.status),
  );
  if (settled.length) {
    heading("Recorded payments by provider", true);
    const amounts = new Map<string, number>();
    for (const p of settled) {
      const label =
        m.jobs.find((j) => j.id === p.jobId)?.sellerName ?? p.sellerAgentId;
      amounts.set(label, (amounts.get(label) ?? 0) + p.amount);
    }
    const max = Math.max(...amounts.values(), 0.000001);
    for (const [label, amount] of amounts) {
      doc.font("Body").fontSize(10);
      const labelHeight = doc.heightOfString(clean(label), {
        width: width - 100,
      });
      room(labelHeight + 38);
      const y = doc.y;
      doc.fillColor(ink).text(clean(label), 52, y, { width: width - 100 });
      doc.text(`${amount.toFixed(2)} tUSDM`, 52 + width - 95, y, {
        width: 95,
        align: "right",
      });
      doc.rect(52, y + labelHeight + 6, width, 10).fill("#EAF5F1");
      doc
        .rect(52, y + labelHeight + 6, (width * amount) / max, 10)
        .fill(accent);
      doc.x = 52;
      doc.y = y + labelHeight + 30;
    }
    body(
      "Gross confirmed or simulated payment amounts before refunds. Escrow locks are distinct from provider release; receipt states below provide the detail.",
    );
  }
  body(
    `Initial: ${m.budget.initial.toFixed(2)} tUSDM\nSpent: ${m.budget.spent.toFixed(2)} tUSDM\nReserved: ${m.budget.reserved.toFixed(2)} tUSDM\nRemaining: ${m.budget.remaining.toFixed(2)} tUSDM\nTest ADA fees and native-token output overhead are separate from the tUSDM budget.`,
  );
  for (const payment of m.payments) {
    const job = m.jobs.find((j) => j.id === payment.jobId);
    heading(
      `${payment.buyerAgentId} to ${job?.sellerName ?? payment.sellerAgentId}`,
      true,
    );
    body(
      `${payment.amount.toFixed(6)} ${payment.asset} | ${payment.mode} | ${payment.network} | ${payment.status}\nTransaction: ${payment.txHash ?? "Not recorded"}${payment.escrow ? `\nEscrow state: ${payment.escrow.state}` : ""}${payment.escrow?.refundTxHash ? `\nRefund transaction: ${payment.escrow.refundTxHash}` : ""}`,
    );
  }
  heading("Execution log");
  for (const event of m.events) {
    const text = `${event.createdAt} | ${event.type}\n${event.message}`;
    doc.font("Body").fontSize(10);
    room(
      doc.heightOfString(clean(text), { width, lineGap: 3, paragraphGap: 7 }) +
        12,
    );
    body(text);
  }
  heading("Verification scope");
  body(
    "This report passed the existing AgentOS schema, content and configured AI checks. These checks do not independently establish factual accuracy. A confirmed escrow lock or result submission is distinct from provider withdrawal and release.",
  );
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("Body")
      .fontSize(8)
      .fillColor(muted)
      .text(`AgentOS | ${m.id.slice(0, 8)}`, 52, doc.page.height - 36, {
        width: width / 2,
        lineBreak: false,
      });
    doc.text(
      `${i + 1} / ${pages.count}`,
      52 + width / 2,
      doc.page.height - 36,
      { width: width / 2, align: "right", lineBreak: false },
    );
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return output;
}
