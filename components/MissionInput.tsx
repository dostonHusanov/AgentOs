"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ArrowRight,
  ArrowUpRight,
  SlidersHorizontal,
  ShieldCheck,
  Search,
  Database,
  FileText,
  BrainCircuit,
  Check,
  Wallet,
} from "lucide-react";
import { Shell } from "./Shell";
export const defaultGoal =
  "Research the best city in Southeast Asia for a remote software developer to live for one month. Compare cost of living, internet quality, safety, and coworking options. Give me a final recommendation.";
export function MissionInput({
  paymentMode,
  aiMode,
}: {
  paymentMode: string;
  aiMode: string;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(defaultGoal),
    [budget, setBudget] = useState(5),
    [advanced, setAdvanced] = useState(false),
    [max, setMax] = useState(2),
    [rep, setRep] = useState(80),
    [escrow, setEscrow] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function launch() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          budget,
          asset: "tUSDM",
          policy: {
            maxSinglePurchase: max,
            minimumReputation: rep,
            escrowThreshold: escrow,
          },
        }),
      });
      const m = await r.json();
      if (!r.ok) throw new Error(m.error);
      sessionStorage.setItem(`mission:${m.id}`, m.accessToken);
      const start = await fetch(`/api/missions/${m.id}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${m.accessToken}` },
      });
      if (!start.ok) throw new Error("Mission saved but could not start.");
      router.push(`/mission/${m.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create mission");
      setBusy(false);
    }
  }
  return (
    <Shell paymentMode={paymentMode} aiMode={aiMode}>
      <main className="home">
        <div className="page-kicker">
          <span className="tiny-line" /> MISSION CONTROL{" "}
          <span className="kicker-end">01 / CREATE</span>
        </div>
        <section className="hero">
          <div>
            <div className="eyebrow">
              <i /> THE NEXT ECONOMY IS AUTONOMOUS
            </div>
            <h1>
              Give AI a goal and a budget.
              <br />
              <span>It builds the team.</span>
            </h1>
            <p>
              Specialized agents discover, hire, and pay each other to get your
              work done.
              <br className="desktop-break" /> You set the destination. They
              handle the execution.
            </p>
          </div>
          <div className="hero-stamp">
            <Boxes size={34} />
            <span>
              AUTONOMOUS
              <br />
              AI COMMERCE
            </span>
          </div>
        </section>
        <div className="home-grid">
          <section className="panel mission-compose">
            <div className="panel-heading">
              <span>
                <span className="step-number">01</span> Define your mission
              </span>
              <span className="small-label">YOU SET THE GOAL</span>
            </div>
            <label htmlFor="goal" className="field-label">
              What do you want to accomplish?
            </label>
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={6000}
            />
            <div className="input-foot">
              <span>
                <i /> Your manager will plan the work autonomously
              </span>
              <span>{goal.length} / 6000</span>
            </div>
            <div className="budget-inputs">
              <div>
                <label htmlFor="budget" className="field-label">
                  Maximum budget
                </label>
                <div className="number-field">
                  <Wallet size={17} />
                  <input
                    id="budget"
                    type="number"
                    step=".1"
                    min=".1"
                    max="1000"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                  <span>tUSDM</span>
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor="asset">
                  Settlement asset
                </label>
                <div className="asset-field">
                  <span className="asset-dot">$</span>
                  <select id="asset">
                    <option>tUSDM · Preprod</option>
                  </select>
                  <Check size={15} />
                </div>
              </div>
            </div>
            <button
              className="advanced-toggle"
              onClick={() => setAdvanced(!advanced)}
            >
              <SlidersHorizontal size={15} /> Spending policies{" "}
              <span>{advanced ? "−" : "+"}</span>
            </button>
            {advanced && (
              <div className="policy-fields">
                <label>
                  Max purchase
                  <input
                    type="number"
                    min=".1"
                    step=".1"
                    value={max}
                    onChange={(e) => setMax(Number(e.target.value))}
                  />
                </label>
                <label>
                  Min reputation
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={rep}
                    onChange={(e) => setRep(Number(e.target.value))}
                  />
                </label>
                <label>
                  Escrow threshold
                  <input
                    type="number"
                    min=".1"
                    step=".1"
                    value={escrow}
                    onChange={(e) => setEscrow(Number(e.target.value))}
                  />
                </label>
                <p>
                  Purchases above the escrow threshold are blocked until escrow
                  is configured.
                </p>
              </div>
            )}
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            <button
              className="launch-button"
              onClick={launch}
              disabled={busy || goal.trim().length < 20 || budget <= 0}
            >
              {busy ? "Creating mission…" : "Launch Autonomous Mission"}
              <ArrowRight size={19} />
            </button>
            <div className="compose-note">
              <ShieldCheck size={14} /> Server-enforced budget. Every purchase
              has a receipt.
            </div>
          </section>
          <section className="panel preview-panel">
            <div className="panel-heading">
              <span>
                <span className="step-number">02</span> An economy, working for
                you
              </span>
              <span className="preview-tag">HOW IT WORKS</span>
            </div>
            <div className="preview-graph">
              <div className="user-node">YOUR GOAL + BUDGET</div>
              <div className="connector vertical" />
              <div className="preview-node manager">
                <div className="node-icon">
                  <BrainCircuit size={22} />
                </div>
                <div>
                  <strong>Manager Agent</strong>
                  <span>Plans · discovers · evaluates · hires</span>
                </div>
                <span className="node-tag">ORCHESTRATOR</span>
              </div>
              <div className="tree-line">
                <span>Discovers providers by capability</span>
              </div>
              <div className="preview-agents">
                <div className="preview-node">
                  <Search size={19} />
                  <strong>Research</strong>
                  <span>web_research</span>
                </div>
                <div className="preview-node">
                  <FileText size={19} />
                  <strong>Report</strong>
                  <span>report_generation</span>
                </div>
              </div>
              <div className="nested-line">
                <span>↳ Agents can hire other agents</span>
              </div>
              <div className="preview-node data">
                <Database size={18} />
                <div>
                  <strong>Data Agent</strong>
                  <span>Paid specialist resource</span>
                </div>
                <span className="node-tag">NESTED HIRE</span>
              </div>
            </div>
            <div className="protocol-row">
              <span>
                x402 <ArrowRight size={12} /> Cardano <ArrowRight size={12} />{" "}
                Verified result
              </span>
              <ArrowUpRight size={16} />
            </div>
          </section>
        </div>
        <section className="principles">
          <div>
            <span>01 / DISCOVERY</span>
            <h3>The right agent for the job.</h3>
            <p>
              Providers compete on capability, reputation, and price. Your
              manager chooses.
            </p>
          </div>
          <div>
            <span>02 / AUTONOMY</span>
            <h3>A team that builds itself.</h3>
            <p>
              Hired agents commission specialists. Every relationship stays
              visible.
            </p>
          </div>
          <div>
            <span>03 / ACCOUNTABILITY</span>
            <h3>Every decision. Every payment.</h3>
            <p>
              Follow the execution tree, spending policies, and transaction
              receipts live.
            </p>
          </div>
        </section>
      </main>
    </Shell>
  );
}
