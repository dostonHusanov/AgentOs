import { ArrowUpRight, ArrowRight, Receipt } from "lucide-react";
import type { Payment, PublicMission } from "@/types/mission";
import { agentName } from "./AgentGraph";
import { explorerUrl } from "@/lib/cardano/explorer";
export function TransactionFeed({
  payments,
  mission,
}: {
  payments: Payment[];
  mission: PublicMission;
}) {
  return (
    <section className="panel transactions">
      <div className="panel-heading">
        <span>Settlement activity</span>
        <span className="count-badge">{payments.length}</span>
      </div>
      {!payments.length ? (
        <div className="empty-state">
          <Receipt size={25} />
          <p>Payment receipts will appear here</p>
        </div>
      ) : (
        payments.map((p) => (
          <article className="receipt" key={p.id}>
            <div>
              <span className={p.mode === "simulation" ? "amber" : "cyan"}>
                {p.mode === "simulation"
                  ? "SIMULATED PAYMENT"
                  : p.escrow?.state === "refunded"
                    ? "REAL ESCROW REFUND"
                    : p.escrow && p.status === "confirmed"
                      ? "REAL ESCROW LOCK"
                      : p.status === "confirmed"
                        ? "REAL PAYMENT"
                        : "PAYMENT UNCONFIRMED"}
              </span>
              <strong>
                {p.amount.toFixed(2)} <small>{p.asset}</small>
              </strong>
            </div>
            <p>
              {agentName(p.buyerAgentId, mission)} <ArrowRight size={12} />{" "}
              {agentName(p.sellerAgentId, mission)}
            </p>
            <div className="receipt-bottom">
              <span>
                {(p.escrow?.state ?? p.status)
                  .replaceAll("_", " ")
                  .toUpperCase()}
              </span>
              {p.escrow?.refundTxHash || p.explorerUrl ? (
                <a
                  href={
                    p.escrow?.refundTxHash
                      ? explorerUrl(p.escrow.refundTxHash)
                      : p.explorerUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {(p.escrow?.refundTxHash ?? p.txHash)?.slice(0, 12)}…{" "}
                  <ArrowUpRight size={12} />
                </a>
              ) : (
                <span>No on-chain transaction</span>
              )}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
