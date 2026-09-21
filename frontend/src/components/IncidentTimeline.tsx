import type { SimulationEvent } from "../types";

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  return `T+${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function IncidentTimeline({
  events,
  onSelect,
  onClear,
}: {
  events: SimulationEvent[];
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="incident-timeline">
      <header className="timeline-head">
        <div>
          <p className="eyebrow">Propagation log</p>
          <h3>Network events</h3>
        </div>
        {events.length > 0 && (
          <button type="button" onClick={onClear}>
            Clear
          </button>
        )}
      </header>

      <div className="timeline-list">
        {events.length === 0 && (
          <div className="timeline-empty">
            <span />
            <p>Run a cloudburst or blockage scenario to populate the operational timeline.</p>
          </div>
        )}
        {events.slice(0, 12).map((event) => (
          <button
            type="button"
            key={event.id}
            className={`timeline-item severity-${event.severity}`}
            onClick={() => event.segmentId && onSelect(event.segmentId)}
            disabled={!event.segmentId}
          >
            <span className="timeline-rail">
              <i />
            </span>
            <span className="timeline-copy">
              <span>
                <strong>{event.title}</strong>
                <time>{formatTime(event.elapsedMinutes)}</time>
              </span>
              <small>{event.description}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
