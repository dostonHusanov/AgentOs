import { z } from "zod";
import { transition } from "@/lib/mission/state-machine";
import { getMission, event, save } from "@/lib/mission/store";
import { authorize, apiError } from "@/lib/api";
import { localAgents } from "@/lib/agents/discovery";
import {
  requirements,
  acceptPayment,
  checkInternalToken,
} from "@/lib/cardano/x402";
import { cityData } from "@/lib/agents/data-agent";
import { research } from "@/lib/agents/research-agent";
import { report } from "@/lib/agents/report-agent";
import { hire } from "@/lib/mission/executor";
export const runtime = "nodejs";
export const maxDuration = 600;
const globals = globalThis as typeof globalThis & {
  agentosJobs?: Map<string, Promise<unknown>>;
};
const executions = (globals.agentosJobs ??= new Map());
const bodySchema = z.object({
  missionId: z.uuid(),
  jobId: z.uuid(),
  context: z.unknown().optional(),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const m = getMission(body.missionId);
    authorize(request, m);
    const j = m.jobs.find(
      (job) => job.id === body.jobId && job.sellerAgentId === id,
    );
    if (!j) throw new Error("Job does not belong to seller or mission");
    checkInternalToken(request.headers.get("X-AgentOS-Internal") ?? "", m, j);
    if (request.headers.get("Idempotency-Key") !== j.id)
      throw new Error("Idempotency key mismatch");
    const a = localAgents().find((agent) => agent.id === id);
    if (!a) throw new Error("Unsupported agent");
    const signature = request.headers.get("PAYMENT-SIGNATURE");
    if (!signature) {
      const required = {
        x402Version: 2,
        resource: {
          url: a.endpoint,
          description: j.objective,
          mimeType: "application/json",
        },
        accepts: [requirements(m, j, a)],
      };
      return Response.json(required, {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(required)).toString(
            "base64",
          ),
        },
      });
    }
    if (j.result !== undefined) {
      await acceptPayment(m, j, a, signature);
      return Response.json(j.result);
    }
    if (j.status === "failed") throw new Error("Job already failed");
    let execution = executions.get(j.id);
    if (!execution) {
      execution = (async () => {
        await acceptPayment(m, j, a, signature);
        j.status = "paid";
        event(m, "job_paid", `${a.name} payment verified`, j.id);
        j.status = "executing";
        if (!j.parentJobId) transition(m, "executing");
        event(m, "agent_started", `${a.name} is executing`, j.id);
        if (m.aiMode === "fixture")
          await new Promise((resolve) => setTimeout(resolve, 450));
        if (m.failNextProvider && j.capability === "web_research") {
          m.failNextProvider = false;
          save(m);
          throw new Error("DEMO FAILURE SIMULATION: provider execution failed");
        }
        const output =
          j.capability === "structured_city_data"
            ? cityData
            : j.capability === "web_research"
              ? await research(m, j, (cap, obj) => hire(m, cap, obj, j))
              : j.capability === "report_generation"
                ? await report(m, j, body.context)
                : undefined;
        if (output === undefined) throw new Error("Unsupported capability");
        j.result = output;
        save(m);
        return output;
      })();
      executions.set(j.id, execution);
    }
    return Response.json(await execution);
  } catch (e) {
    return apiError(e);
  }
}
