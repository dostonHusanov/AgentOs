import test from "node:test";
import assert from "node:assert/strict";
import { createReportPdf } from "../lib/report/pdf";
import type { PublicMission } from "../types/mission";

test("PDF export refuses incomplete work and emits a complete paginated PDF for a report", async () => {
  const m = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "executing",
    goal: "Research an outsourcing business in Singapore",
    createdAt: "2026-10-07T00:00:00Z",
    paymentMode: "simulation",
    budget: {
      initial: 5,
      spent: 1.5,
      reserved: 0,
      remaining: 3.5,
      asset: "tUSDM",
    },
    jobs: [],
    payments: [],
    events: [],
  } as unknown as PublicMission;
  assert.throws(() => createReportPdf(m), /Completed report required/);
  m.status = "completed";
  m.result = {
    title: "Singapore outsourcing: café and software services",
    recommendation:
      "Evaluate demand and customer willingness to pay before committing capital. ".repeat(
        6,
      ),
    comparison: [
      {
        option: "Software delivery",
        assessment:
          "Start with a narrow service and a measurable customer validation plan. ".repeat(
            30,
          ),
      },
    ],
    evidence: ["Public source findings"],
    limitations: ["Forecasts are estimates, not verified prices."],
  };
  const pdf = await createReportPdf(m);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.subarray(-100).toString().includes("%%EOF"));
  assert.ok(pdf.length > 1000);
  assert.ok(
    (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length > 1,
    "Long content paginates",
  );
});
