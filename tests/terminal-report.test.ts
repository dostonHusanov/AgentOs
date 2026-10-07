import test from "node:test";
import assert from "node:assert/strict";
import { terminalReport } from "../lib/report/terminal";
import { createReportPdf } from "../lib/report/pdf";
import type { PublicMission } from "../types/mission";
test("failed missions export explicitly unverified partial findings without changing status or leaking proofs", async () => {
  const m = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "failed",
    goal: "Research franchise feasibility",
    createdAt: "2026-10-07T00:00:00Z",
    paymentMode: "simulation",
    error: "Missing demographics and prices",
    budget: { initial: 5, spent: 1, remaining: 4, reserved: 0, asset: "tUSDM" },
    jobs: [
      {
        id: "job",
        sellerName: "Research",
        sellerAgentId: "research",
        status: "failed",
        objective: "Research market",
        error: "Incomplete",
        result: {
          summary: "Preliminary market lead",
          findings: ["Supplier lead"],
          accessToken: "SECRET",
        },
      },
    ],
    payments: [],
    events: [],
  } as unknown as PublicMission;
  const report = terminalReport(m)!;
  assert.match(report.title, /Partial report/);
  assert.match(report.evidence[0], /unverified/);
  assert.ok(report.limitations.includes(m.error!));
  assert.equal(JSON.stringify(report).includes("SECRET"), false);
  const pdf = await createReportPdf(m);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(m.status, "failed");
  assert.equal(m.result, undefined);
  m.status = "executing";
  assert.equal(terminalReport(m), undefined);
});
