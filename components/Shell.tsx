import Link from "next/link";
import { Boxes, ArrowUpRight, Activity, Command } from "lucide-react";
export function Shell({
  children,
  paymentMode = "simulation",
  aiMode = "fixture",
}: {
  children: React.ReactNode;
  paymentMode?: string;
  aiMode?: string;
}) {
  return (
    <div className="app-shell">
      <aside className="rail">
        <Link href="/" className="logo-icon" aria-label="AgentOS home">
          <Boxes size={23} />
        </Link>
        <Link
          href="/"
          className="rail-button active"
          aria-label="Mission control"
        >
          <Command size={19} />
        </Link>
        <a className="rail-button" href="/health" aria-label="System health">
          <Activity size={19} />
        </a>
        <span className="rail-bottom">AO</span>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <Link href="/" className="wordmark">
            Agent<span>OS</span>
            <span className="version">BETA / 01</span>
          </Link>
          <div className="top-right">
            <span className="network">
              <i /> CARDANO PREPROD
            </span>
            <a
              href="https://developers.cardano.org/x402/"
              target="_blank"
              rel="noreferrer"
              className="docs-link"
            >
              Protocol docs <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <div className="mode-strip">
          <span className={paymentMode === "simulation" ? "amber" : "cyan"}>
            {paymentMode === "simulation"
              ? "SIMULATED PAYMENTS"
              : "CARDANO PAYMENT MODE"}
          </span>
          <span> / </span>
          <span>
            {aiMode === "fixture"
              ? "FIXTURE AI · CONTROLLED DEMO"
              : "LIVE GEMINI AGENTS"}
          </span>
          <span className="mode-note">
            {paymentMode === "simulation"
              ? "No funds move on-chain."
              : "Receipts appear only after settlement confirmation."}
          </span>
        </div>
        {children}
        <footer>
          <span>AGENTOS / AUTONOMOUS AGENT ECONOMY</span>
          <span>Built for agents. Settled on Cardano.</span>
        </footer>
      </div>
    </div>
  );
}
