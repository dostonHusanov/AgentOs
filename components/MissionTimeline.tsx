import type { MissionEvent } from "@/types/mission";
export function MissionTimeline({ events }: { events: MissionEvent[] }) {
  return (
    <section className="panel timeline-panel">
      <div className="panel-heading">
        <span>Execution log</span>
        <span className="small-label">{events.length} EVENTS</span>
      </div>
      <div className="timeline" aria-live="polite">
        {events.length === 0 && (
          <div className="empty-state">
            Ready to launch. Your mission is saved.
          </div>
        )}
        {[...events].reverse().map((e) => (
          <div
            className={`timeline-event ${e.type.includes("failed") ? "event-error" : ""}`}
            key={e.id}
          >
            <time>
              {new Date(e.createdAt).toLocaleTimeString("en-GB", {
                timeZone: "Asia/Singapore",
              })}
            </time>
            <i />
            <div>
              <span>{e.type.replaceAll("_", " ")}</span>
              <p>{e.message}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
