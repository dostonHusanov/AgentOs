import { errorSummary } from "@/lib/errors";
import { randomUUID } from "node:crypto";
import type { Mission, Job } from "@/types/mission";
import { discoverAgents } from "@/lib/agents/discovery";
import { evaluate } from "@/lib/agents/evaluator";
import { verifyDeliverable } from "@/lib/agents/verifier";
import { event, save, running } from "./store";
import { reserve, release, validatePurchase } from "./policies";
import { planMission } from "./planner";
import { transition } from "./state-machine";
import { paidRequest } from "@/lib/cardano/x402";
import { reportSchema } from "@/lib/ai/schemas";
import type { AgentDefinition } from "@/types/agent";
import { submitEscrowResult, requestEscrowRefund } from "@/lib/masumi/escrow";
export async function hire(
  m: Mission,
  capability: string,
  objective: string,
  parent?: Job,
  context?: unknown,
): Promise<unknown> {
  if (
    m.status === "completed" ||
    m.status === "failed" ||
    parent?.status === "failed"
  )
    throw new Error("Mission or parent job is terminal");
  const depth = parent ? parent.depth + 1 : 1;
  const ancestors: string[] = ["manager"];
  let cursor = parent;
  while (cursor) {
    ancestors.push(cursor.sellerAgentId);
    cursor = m.jobs.find((j) => j.id === cursor?.parentJobId);
  }
  const excluded = new Set<string>();
  let lastError = "No valid provider found";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!parent) transition(m, "discovering");
    event(
      m,
      "capability_required",
      `${parent ? parent.sellerAgentId : "Manager"} needs ${capability}`,
    );
    const candidates = (await discoverAgents(capability)).filter(
      (a) => !excluded.has(a.id),
    );
    event(
      m,
      "agent_discovered",
      `${candidates.length} ${capability} providers discovered (${candidates[0]?.source ?? "local"})`,
    );
    if (!parent) transition(m, "selecting");
    const ranking = evaluate(m, candidates, capability, depth, ancestors);
    for (const candidate of ranking)
      event(
        m,
        "agent_evaluated",
        `${candidate.agent.name}: ${candidate.reason}`,
      );
    const selected = ranking.find((r) => !r.rejection);
    if (!selected)
      throw new Error(
        lastError === "No valid provider found"
          ? ranking.map((r) => r.rejection).join("; ") || lastError
          : lastError,
      );
    const a: AgentDefinition = selected.agent;
    validatePurchase(m, a, capability, depth, ancestors);
    const job: Job = {
      id: randomUUID(),
      missionId: m.id,
      parentJobId: parent?.id,
      buyerAgentId: parent?.sellerAgentId ?? "manager",
      sellerAgentId: a.id,
      capability,
      objective,
      status: "provider_selected",
      price: a.pricing.amount,
      reason: selected.reason,
      sellerName: a.name,
      reputation: a.reputation,
      registrySource: a.source,
      depth,
      createdAt: new Date().toISOString(),
    };
    m.jobs.push(job);
    reserve(m, job.price);
    save(m);
    event(
      m,
      attempt ? "replacement_selected" : "agent_selected",
      `${a.name} selected: ${selected.reason}`,
      job.id,
    );
    if (parent)
      event(
        m,
        "sub_agent_hired",
        `${parent.sellerAgentId} commissions ${a.name}`,
        job.id,
      );
    try {
      if (!parent) transition(m, "purchasing");
      const result = await paidRequest(m, job, a, context);
      job.status = "verifying";
      if (!parent) transition(m, "verifying");
      event(m, "result_received", `${a.name} returned a deliverable`, job.id);
      job.result = await verifyDeliverable(m, job, result, context);
      await submitEscrowResult(m, job, job.result);
      job.status = "completed";
      event(
        m,
        "verification_passed",
        `${a.name}: required fields and content thresholds passed`,
        job.id,
      );
      return job.result;
    } catch (error) {
      lastError = errorSummary(error);
      job.status = "failed";
      job.error = lastError;
      excluded.add(a.id);
      const payment = m.payments.find((p) => p.jobId === job.id);
      if (payment?.escrow) {
        if (payment.escrow.state === "funds_locked") {
          try {
            await requestEscrowRefund(m, payment);
          } catch {
            event(
              m,
              "escrow_refund_pending",
              "Refund needs reconciliation; no replacement will be hired",
              job.id,
            );
          }
        }
        save(m);
        throw new Error(
          "Escrow delivery failed or settlement is uncertain. Reconcile the lock/refund before retrying; no replacement payment was made.",
        );
      }
      if (
        !payment ||
        payment.status === "reserved" ||
        payment.status === "failed"
      ) {
        release(m, job.price);
        if (payment) payment.status = "failed";
      }
      event(
        m,
        "agent_failed",
        `${a.name}: ${lastError}${payment?.status === "confirmed" || payment?.status === "simulated" ? " · direct payment is not refundable" : ""}`,
        job.id,
      );
      // Pending/ambiguous settlement retains the reservation and halts. Never
      // commission a replacement while the original payment may still settle.
      if (m.payments.some((p) => p.status === "submitted"))
        throw new Error(
          "Payment pending or uncertain. Reservation retained; reconciliation required before retry.",
        );
    }
  }
  throw new Error(lastError);
}
export async function executeMission(m: Mission) {
  if (running.has(m.id) || m.status !== "created") return;
  running.add(m.id);
  try {
    transition(m, "planning");
    m.plan = await planMission(m);
    event(m, "plan_created", m.plan.summary);
    const results = new Map<string, unknown>();
    for (const task of m.plan.tasks) {
      const dependencies = task.dependsOn.map((id) => ({
        task: id,
        result: results.get(id),
      }));
      const result = await hire(
        m,
        task.capability,
        task.objective,
        undefined,
        dependencies,
      );
      results.set(task.id, result);
    }
    transition(m, "synthesizing");
    const report = [...m.plan.tasks]
      .reverse()
      .find((t) => t.capability === "report_generation");
    if (report) m.result = reportSchema.parse(results.get(report.id));
    else
      m.result = reportSchema.parse(
        await hire(m, "report_generation", m.goal, undefined, [
          ...results.values(),
        ]),
      );
    transition(m, "completed");
    m.completedAt = new Date().toISOString();
    save(m);
  } catch (error) {
    m.error = errorSummary(error);
    m.status = "failed";
    event(m, "mission_failed", m.error);
  } finally {
    running.delete(m.id);
  }
}
