import { checkHealth } from "@/lib/health";
import { Shell } from "@/components/Shell";
import { CheckCircle2, AlertTriangle, FlaskConical } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Health() {
  const h = await checkHealth();
  return (
    <Shell paymentMode={h.paymentMode} aiMode={h.aiMode}>
      <main className="dashboard">
        <div className="page-kicker">SYSTEM / HEALTH</div>
        <div className="dashboard-title">
          <div>
            <h1>{h.status}</h1>
            <p>
              Run npm run demo:check for live connectivity and wallet balance
              checks.
            </p>
          </div>
        </div>
        <section className="panel">
          <div className="panel-heading">Infrastructure readiness</div>
          {h.checks.map((c) => (
            <div className="health-row" key={c.component}>
              {c.status === "ready" ? (
                <CheckCircle2 size={19} className="cyan" />
              ) : c.status === "blocked" ? (
                <AlertTriangle size={19} className="amber" />
              ) : (
                <FlaskConical size={19} className="amber" />
              )}
              <div>
                <strong>{c.component}</strong>
                <p>{c.detail}</p>
              </div>
              <span className={c.status === "ready" ? "cyan" : "amber"}>
                {c.status.toUpperCase()}
              </span>
            </div>
          ))}
        </section>
      </main>
    </Shell>
  );
}
