import {
  BrainCircuit,
  Search,
  Database,
  FileText,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { Job, PublicMission } from "@/types/mission";
export const agentName = (id: string, mission?: PublicMission) =>
  id === "manager"
    ? "Manager Agent"
    : (mission?.jobs.find((j) => j.sellerAgentId === id)?.sellerName ?? id);
export function AgentGraph({ mission }: { mission: PublicMission }) {
  function node(job: Job) {
    const children = mission.jobs.filter((j) => j.parentJobId === job.id);
    const Icon =
      job.capability === "web_research"
        ? Search
        : job.capability === "structured_city_data"
          ? Database
          : FileText;
    return (
      <div key={job.id} className="job-branch">
        <div className="edge-label">
          <span>{agentName(job.buyerAgentId, mission)} →</span>{" "}
          {job.price.toFixed(2)} tUSDM
        </div>
        <div className={`agent-node ${job.status}`}>
          <div className="agent-node-main">
            <span className="agent-avatar">
              <Icon size={21} />
            </span>
            <div>
              <strong>{job.sellerName}</strong>
              <span>{job.capability}</span>
            </div>
            <span className="agent-state">
              {job.status === "completed" ? (
                <Check size={17} />
              ) : job.status === "failed" ? (
                <AlertCircle size={17} />
              ) : (
                <Loader2 size={17} className="spin" />
              )}
            </span>
          </div>
          <div className="node-details">
            <span>{job.status.replaceAll("_", " ")}</span>
            <span>
              REP {job.reputation} · {job.price.toFixed(2)} tUSDM
            </span>
          </div>
          <details className="decision">
            <summary>
              Selection decision · {job.registrySource} registry
            </summary>
            <p>{job.reason}</p>
          </details>
        </div>
        {children.length > 0 && (
          <div className="nested-jobs">
            <span className="nested-caption">AGENT-TO-AGENT PURCHASE</span>
            {children.map(node)}
          </div>
        )}
      </div>
    );
  }
  return (
    <section className="panel economy-panel">
      <div className="panel-heading">
        <span>Live agent economy</span>
        <span className="live-tag">
          <i />{" "}
          {["completed", "failed"].includes(mission.status)
            ? "RECORDED"
            : "LIVE"}
        </span>
      </div>
      <div className="economy-canvas">
        <div className="manager-root">
          <div className="agent-node-main">
            <span className="agent-avatar manager-avatar">
              <BrainCircuit size={23} />
            </span>
            <div>
              <strong>Manager Agent</strong>
              <span>Goal decomposition & economic decisions</span>
            </div>
            <span className="node-tag">ORCHESTRATOR</span>
          </div>
        </div>
        <div className="root-jobs">
          {mission.jobs.filter((j) => !j.parentJobId).map(node)}
        </div>
        {!mission.jobs.length && (
          <div className="graph-empty">
            <span className="radar" />
            <p>Waiting for the manager to discover providers</p>
          </div>
        )}
      </div>
      <div className="graph-key">
        <span>
          <i className="cyan-dot" /> Autonomous hire
        </span>
        <span>
          <i className="green-dot" /> Verified result
        </span>
        <span>Depth limit · 3</span>
      </div>
    </section>
  );
}
