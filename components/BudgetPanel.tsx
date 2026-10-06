import type { MissionBudget } from "@/types/mission";
export function BudgetPanel({ budget: b }: { budget: MissionBudget }) {
  return (
    <section className="panel budget-panel">
      <div className="panel-heading">
        <span>Mission treasury</span>
        <span className="small-label">{b.asset}</span>
      </div>
      <div className="remaining-number">
        {b.remaining.toFixed(2)}
        <span>remaining</span>
      </div>
      <div className="budget-bar">
        <span
          style={{ width: `${Math.min(100, (b.spent / b.initial) * 100)}%` }}
        />
        <i
          style={{ width: `${Math.min(100, (b.reserved / b.initial) * 100)}%` }}
        />
      </div>
      <div className="budget-metrics">
        <div>
          <span>INITIAL</span>
          <strong>{b.initial.toFixed(2)}</strong>
        </div>
        <div>
          <span>SPENT</span>
          <strong>{b.spent.toFixed(2)}</strong>
        </div>
        <div>
          <span>RESERVED</span>
          <strong>{b.reserved.toFixed(2)}</strong>
        </div>
      </div>
    </section>
  );
}
