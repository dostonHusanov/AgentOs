import { terminalReport } from "../lib/report/terminal";
import type { PublicMission } from "../types/mission";
import { MissionVault } from "./vault";
import { z } from "zod";
import { SafeMcpError } from "./errors";

export function localBaseUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new SafeMcpError(
      "AGENTOS_BASE_URL must be a loopback HTTP origin, such as http://127.0.0.1:3001.",
    );
  return url.origin;
}

export function createInputSchema(limit: number) {
  return z
    .object({
      goal: z
        .string()
        .trim()
        .min(20)
        .max(6000)
        .describe("The concrete goal to complete; at least 20 characters."),
      maxBudget: z
        .number()
        .min(0.1)
        .max(limit)
        .refine(
          (n) => n === Math.round(n * 1e6) / 1e6,
          "Use at most six decimal places.",
        )
        .describe("Required hard mission spending limit in Preprod tUSDM."),
      constraints: z
        .array(z.string().trim().min(1).max(500))
        .max(20)
        .optional()
        .describe(
          "Additional requirements; these cannot override server spending policies.",
        ),
    })
    .strict()
    .refine(
      (input) => composedGoal(input).length <= 6000,
      "Goal and constraints together must fit within 6000 characters.",
    );
}
export interface CreateInput {
  goal: string;
  maxBudget: number;
  constraints?: string[];
}
function composedGoal(input: CreateInput) {
  return (
    input.goal +
    (input.constraints?.length
      ? `\n\nUser constraints:\n${input.constraints.map((c) => `- ${c}`).join("\n")}`
      : "")
  );
}

export class AgentOSAdapter {
  constructor(
    readonly baseUrl: string,
    private vault: MissionVault,
    readonly maxBudget: number,
    private http: typeof fetch = fetch,
  ) {
    localBaseUrl(baseUrl);
    if (
      !Number.isFinite(maxBudget) ||
      maxBudget < 0.1 ||
      maxBudget > 1000 ||
      maxBudget !== Math.round(maxBudget * 1e6) / 1e6
    )
      throw new SafeMcpError(
        "AGENTOS_MCP_MAX_BUDGET must be between 0.1 and 1000, with at most six decimal places.",
      );
  }
  private async request(
    path: string,
    method = "GET",
    token?: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.http(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new SafeMcpError(
        "AgentOS HTTP request failed or timed out. Check the running web server. Mutating requests are never automatically retried.",
      );
    }
    // Upstream error bodies can contain diagnostic details: never forward them.
    if (!response.ok)
      throw new SafeMcpError(
        response.status === 404
          ? "Mission not found."
          : `AgentOS rejected the request (HTTP ${response.status}).`,
      );
    try {
      return await response.json();
    } catch {
      throw new SafeMcpError("AgentOS returned an invalid response.");
    }
  }
  async create(input: CreateInput) {
    const checked = createInputSchema(this.maxBudget).parse(input);
    const created = z
      .object({
        id: z.string().uuid(),
        accessToken: z.string().regex(/^[a-f0-9]{64}$/),
        status: z.literal("created"),
      })
      .parse(
        await this.request("/api/missions", "POST", undefined, {
          goal: composedGoal(checked),
          budget: checked.maxBudget,
          asset: "tUSDM",
          // Omit policy entirely: the existing API's defaults remain authoritative.
        }),
      );
    this.vault.put({
      missionId: created.id,
      accessToken: created.accessToken,
      baseUrl: this.baseUrl,
    });
    // The existing start endpoint schedules execution with Next's after().
    // MCP cancellation/disconnection is deliberately not forwarded to this call.
    let started = false;
    try {
      await this.request(
        `/api/missions/${created.id}/start`,
        "POST",
        created.accessToken,
      );
      started = true;
    } catch {
      /* Ambiguous start must not create a replacement mission. */
    }
    return {
      missionId: created.id,
      status: started ? "accepted" : "start_uncertain",
      maxBudget: checked.maxBudget,
      currency: "tUSDM",
      dashboardUrl: `${this.baseUrl}/mcp/mission/${created.id}`,
      message: started
        ? "Mission accepted. Continue this conversation: call agentos_wait_for_mission now, show its logs and progress, and repeat that read-only wait on this SAME ID while status is running. Return the final report and receipts only when complete, or explain a failure. Do not end with only a mission link and do not create another mission."
        : "Mission created, but start acknowledgement is uncertain. Do not create a replacement or retry spending. Poll this mission ID and inspect the web server before any manual recovery.",
    };
  }
  async mission(id: string): Promise<PublicMission> {
    const credential = this.vault.get(id);
    if (credential.baseUrl !== this.baseUrl)
      throw new SafeMcpError("Mission belongs to a different AgentOS origin.");
    const value = (await this.request(
      `/api/missions/${id}`,
      "GET",
      credential.accessToken,
    )) as PublicMission;
    if (
      !value ||
      value.id !== id ||
      !Array.isArray(value.jobs) ||
      !Array.isArray(value.payments) ||
      !Array.isArray(value.events)
    )
      throw new SafeMcpError("AgentOS returned an invalid mission.");
    return value;
  }
  async status(id: string, eventLimit = 20) {
    return this.statusView(await this.mission(id), eventLimit);
  }
  private statusView(m: PublicMission, eventLimit: number) {
    return {
      missionId: m.id,
      status: m.status,
      currentStage: m.status,
      goal: m.goal,
      budget: {
        initial: m.budget.initial,
        spent: m.budget.spent,
        reserved: m.budget.reserved,
        remaining: m.budget.remaining,
        currency: m.budget.asset,
      },
      spent: m.budget.spent,
      remaining: m.budget.remaining,
      agentsUsed: m.jobs.map((j) => ({
        jobId: j.id,
        providerId: j.sellerAgentId,
        providerName: j.sellerName,
        capability: j.capability,
        status: j.status,
        parentJobId: j.parentJobId ?? null,
        registrySource: j.registrySource,
      })),
      nestedHires: m.jobs.filter((j) => Boolean(j.parentJobId)).length,
      latestEvents: m.events.slice(-eventLimit).map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        jobId: e.jobId ?? null,
        createdAt: e.createdAt,
        transactionHash:
          e.type === "payment_confirmed" || e.type === "escrow_locked"
            ? (m.payments.find((p) => p.jobId === e.jobId)?.txHash ?? null)
            : e.type === "escrow_reconciled" &&
                e.message.includes("RefundWithdrawn")
              ? (m.payments.find((p) => p.jobId === e.jobId)?.escrow
                  ?.refundTxHash ?? null)
              : null,
      })),
      dashboardUrl: `${this.baseUrl}/mcp/mission/${m.id}`,
    };
  }
  async wait(
    id: string,
    seconds: number,
    afterEventId: string | undefined,
    signal: AbortSignal,
    progress: (message: string) => Promise<void>,
  ) {
    const deadline = Date.now() + seconds * 1000;
    const seen = new Set<string>();
    const logs: {
      id: string;
      type: string;
      message: string;
      jobId: string | null;
      createdAt: string;
    }[] = [];
    let cursor = afterEventId;
    for (;;) {
      if (signal.aborted)
        throw new SafeMcpError(
          "Waiting was cancelled; the existing mission continues. Resume waiting on this same mission ID.",
        );
      const mission = await this.mission(id);
      const snapshot = this.statusView(mission, 2000);
      const cursorIndex = cursor
        ? snapshot.latestEvents.findIndex((e) => e.id === cursor)
        : -1;
      const fresh = snapshot.latestEvents
        .slice(cursorIndex + 1)
        .filter((e) => !seen.has(e.id));
      for (const event of fresh) {
        seen.add(event.id);
        logs.push(event);
      }
      if (logs.length > 2000) logs.splice(0, logs.length - 2000);
      cursor = snapshot.latestEvents.at(-1)?.id ?? cursor;
      await progress(
        `${snapshot.currentStage} · ${snapshot.spent.toFixed(2)} tUSDM spent · ${snapshot.remaining.toFixed(2)} remaining${fresh.length ? "\n" + fresh.map((e) => `${e.createdAt} [${e.type}] ${e.message}${e.transactionHash ? ` | tx ${e.transactionHash}` : ""}`).join("\n") : "\nWaiting for the next mission event; no new purchases requested by this wait tool."}`,
      );
      const terminal = ["completed", "failed"].includes(snapshot.status);
      if (terminal || Date.now() >= deadline) {
        const final = terminal
          ? [this.resultView(mission), this.receiptsView(mission)]
          : undefined;
        return {
          ...snapshot,
          latestEvents: snapshot.latestEvents.slice(-20),
          logs,
          lastEventId: cursor ?? null,
          finished: terminal,
          ...(final ? { report: final[0], receipts: final[1] } : {}),
          nextAction: terminal
            ? "Present the final outcome, evidence, limitations and receipts. For completed missions include the supplied PDF file/download link automatically, without asking whether the user wants a PDF. Do not create another mission."
            : "The mission is still running. Show the exact new timestamped logs (event type and message), stage and budget to the user, then immediately call agentos_wait_for_mission again for the SAME missionId with lastEventId as afterEventId. Keep working until completed or failed; a wait window ending is not mission completion. Do not invent confirmations or refunds that have no recorded event.",
        };
      }
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(
          done,
          Math.min(2000, Math.max(0, deadline - Date.now())),
        );
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      });
    }
  }
  async result(id: string) {
    return this.resultView(await this.mission(id));
  }
  private resultView(m: PublicMission) {
    const report = terminalReport(m);
    if (!report)
      return {
        missionId: m.id,
        status: m.status,
        result: null,
        message:
          m.status === "failed"
            ? "Mission failed. Inspect mission events and receipts; already confirmed spending is retained. No automatic replacement was started."
            : "The mission is not complete. Continue by calling agentos_wait_for_mission on this same ID and show its logs. Do not end with only a pending status or create a replacement.",
      };
    return {
      missionId: m.id,
      status: m.status,
      pdf: this.pdfDescriptor(m.id),
      result: {
        title: report.title,
        recommendation: report.recommendation,
        comparison: report.comparison.map((c) => ({
          option: c.option,
          assessment: c.assessment,
        })),
        evidence: [...report.evidence],
        limitations: [...report.limitations],
      },
      sources: m.jobs
        .filter(
          (j) => j.status === "completed" && j.capability === "web_research",
        )
        .flatMap((j) => {
          const parsed = z
            .object({
              sources: z.array(
                z.object({
                  title: z.string(),
                  url: z
                    .string()
                    .url()
                    .refine((value) => {
                      const url = new URL(value);
                      return (
                        ["http:", "https:"].includes(url.protocol) &&
                        !url.username &&
                        !url.password
                      );
                    }),
                }),
              ),
            })
            .safeParse(j.result);
          return parsed.success
            ? parsed.data.sources.map((s) => ({
                jobId: j.id,
                providerId: j.sellerAgentId,
                title: s.title,
                url: s.url,
              }))
            : [];
        }),
      verification: {
        completedJobs: m.jobs.filter((j) => j.status === "completed").length,
        checks: m.events
          .filter((e) => e.type === "verification_passed")
          .map((e) => ({ jobId: e.jobId ?? null, message: e.message })),
        meaning:
          "Existing AgentOS schema and content checks; not independent factual verification.",
      },
    };
  }
  pdfDescriptor(id: string) {
    return {
      fileName: `agentos-${id}.pdf`,
      mimeType: "application/pdf",
      uri: `agentos://missions/${id}/report.pdf`,
      downloadUrl: `${this.baseUrl}/mcp/mission/${id}/report`,
    };
  }
  async reportPdf(id: string): Promise<Buffer> {
    const credential = this.vault.get(id);
    if (credential.baseUrl !== this.baseUrl)
      throw new SafeMcpError("Mission belongs to a different AgentOS origin.");
    try {
      const response = await this.http(
        `${this.baseUrl}/api/missions/${id}/report`,
        {
          headers: { Authorization: `Bearer ${credential.accessToken}` },
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("application/pdf")
      )
        throw new Error();
      if (Number(response.headers.get("content-length")) > 10_000_000)
        throw new Error();
      const bytes = Buffer.from(await response.arrayBuffer());
      if (
        bytes.length > 10_000_000 ||
        bytes.subarray(0, 5).toString() !== "%PDF-"
      )
        throw new Error();
      return bytes;
    } catch {
      throw new SafeMcpError(
        "PDF report is unavailable. Keep the AgentOS server running; do not recreate the mission.",
      );
    }
  }
  async receipts(id: string) {
    return this.receiptsView(await this.mission(id));
  }
  async history() {
    const results = await Promise.allSettled(
      this.vault.ids().map((id) => this.receipts(id)),
    );
    return {
      missions: results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      ),
      unavailable: results.filter((result) => result.status === "rejected")
        .length,
    };
  }
  private receiptsView(m: PublicMission) {
    return {
      missionId: m.id,
      status: m.status,
      currency: m.budget.asset,
      spent: m.budget.spent,
      receipts: m.payments.map((p) => ({
        paymentId: p.id,
        jobId: p.jobId,
        payerRole: p.buyerAgentId,
        recipientRole: p.sellerAgentId,
        amount: p.amount,
        currency: p.asset,
        paymentMode: p.mode,
        network: p.network,
        transactionHash: p.txHash ?? null,
        confirmationState: p.status,
        createdAt: p.createdAt,
        escrow: p.escrow
          ? {
              state: p.escrow.state,
              refundTransactionHash: p.escrow.refundTxHash ?? null,
            }
          : null,
      })),
    };
  }
}
