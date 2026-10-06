"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Clock,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import type { PublicMission } from "@/types/mission";
import { Shell } from "./Shell";
import { AgentGraph } from "./AgentGraph";
import { BudgetPanel } from "./BudgetPanel";
import { TransactionFeed } from "./TransactionFeed";
import { MissionTimeline } from "./MissionTimeline";
import { FinalResult } from "./FinalResult";
export function MissionDashboard({ id }: { id: string }) {
  const [mission, setMission] = useState<PublicMission>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const token = sessionStorage.getItem(`mission:${id}`);
    if (!token) {
      setError(
        "This mission requires its session access token. Open it in the browser session that created it.",
      );
      return;
    }
    let source: EventSource;
    fetch(`/api/missions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setMission(data);
        source = new EventSource(
          `/api/missions/${id}/events?token=${encodeURIComponent(token)}`,
        );
        source.addEventListener("snapshot", (e) => {
          const next = JSON.parse((e as MessageEvent).data);
          setMission(next);
          if (["completed", "failed"].includes(next.status)) source.close();
        });
        source.onerror = () => {
          setError(
            "Live connection interrupted. Refresh to reconnect to the saved mission.",
          );
        };
      })
      .catch((e) => setError(e.message));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      source?.close();
      clearInterval(tick);
    };
  }, [id]);
  async function action(kind: "start" | "failure") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/missions/${id}/${kind}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem(`mission:${id}`)}`,
        },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  if (!mission)
    return (
      <Shell>
        <main className="dashboard">
          {error ? (
            <div role="alert" className="error-box">
              {error}
            </div>
          ) : (
            <p>Loading mission…</p>
          )}
          <Link href="/">Return to mission control</Link>
        </main>
      </Shell>
    );
  const elapsed = Math.max(
    0,
    Math.floor(
      ((mission.completedAt ? new Date(mission.completedAt).getTime() : now) -
        new Date(mission.createdAt).getTime()) /
        1000,
    ),
  );
  return (
    <Shell paymentMode={mission.paymentMode} aiMode={mission.aiMode}>
      <main className="dashboard">
        <div className="page-kicker">
          <Link href="/">
            <ArrowLeft size={13} /> MISSION CONTROL
          </Link>
          <span className="kicker-end">02 / EXECUTE</span>
        </div>
        <div className="dashboard-title">
          <div>
            <h1>
              Your mission. <span>In motion.</span>
            </h1>
            <p>Watch the team form, work, and settle.</p>
          </div>
          <span className={`mission-status ${mission.status}`}>
            <i />
            {mission.status.toUpperCase()}
          </span>
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="dashboard-grid">
          <div className="mission-column">
            <section className="panel mission-summary">
              <div className="panel-heading">
                <span>Mission brief</span>
                <ArrowUpRight size={15} />
              </div>
              <p>{mission.goal}</p>
              <div className="mission-meta">
                <span>
                  <Clock size={13} />
                  {Math.floor(elapsed / 60)}m {elapsed % 60}s
                </span>
                <span>#{id.slice(0, 8)}</span>
              </div>
              {mission.plan && (
                <div className="plan">
                  <span className="small-label">EXECUTION PLAN</span>
                  {mission.plan.tasks.map((t, i) => (
                    <div key={t.id}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <p>{t.objective}</p>
                    </div>
                  ))}
                </div>
              )}
              {mission.status === "created" && (
                <button
                  disabled={busy}
                  className="launch-button"
                  onClick={() => action("start")}
                >
                  Start mission <Play size={15} />
                </button>
              )}
              {!["completed", "failed"].includes(mission.status) && (
                <button
                  disabled={busy}
                  className="failure-button"
                  onClick={() => action("failure")}
                >
                  <AlertTriangle size={13} /> Simulate Provider Failure
                  <small>DEMO FAILURE SIMULATION</small>
                </button>
              )}
              {mission.error && (
                <div className="error-box">{mission.error}</div>
              )}
            </section>
            <BudgetPanel budget={mission.budget} />
            <section className="policy-summary">
              <span>
                <span className="cyan-dot" /> SPENDING GUARDRAILS
              </span>
              <p>
                Max purchase{" "}
                <strong>{mission.policy.maxSinglePurchase} tUSDM</strong>
              </p>
              <p>
                Minimum reputation{" "}
                <strong>{mission.policy.minimumReputation}/100</strong>
              </p>
              <p>
                Escrow required above{" "}
                <strong>{mission.policy.escrowThreshold} tUSDM</strong>
              </p>
            </section>
          </div>
          <div className="economy-column">
            <AgentGraph mission={mission} />
            <FinalResult mission={mission} />
            <MissionTimeline events={mission.events} />
          </div>
          <div className="activity-column">
            <TransactionFeed payments={mission.payments} mission={mission} />
            <div className="settlement-note">
              <span className="small-label">THE PROTOCOL</span>
              <h3>
                Work has a price.
                <br />
                Trust has a receipt.
              </h3>
              <p>
                HTTP 402 gates paid resources. Providers verify settlement
                before returning results.
              </p>
              <a
                href="https://developers.cardano.org/x402/"
                target="_blank"
                rel="noreferrer"
              >
                Explore x402 <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}
