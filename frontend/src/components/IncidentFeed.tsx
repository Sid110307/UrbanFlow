import { RISK_LABEL } from "../labels";
import type { Incident } from "../types";

export function IncidentFeed({
  incidents,
  onSelect,
}: {
  incidents: Incident[];
  onSelect: (drainId: string) => void;
}) {
  return (
    <div className="panel feed">
      <h3>Reasoning log</h3>
      <ul className="incident-feed-list">
        {incidents.length === 0 && <li className="mono-note">No anomalies logged yet.</li>}
        {incidents.map((inc) => (
          <li key={inc.id} onClick={() => onSelect(inc.drain_id)}>
            <div className="feed-item-header">
              <span className={`badge badge-${inc.risk_level}`}>{RISK_LABEL[inc.risk_level]}</span>
              <span className="feed-time">{new Date(inc.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="feed-drain">
              {inc.drain_id} &middot; {inc.classification} &middot; {inc.blockage_probability.toFixed(0)}%
            </div>
            <div className="feed-reasoning">{inc.reasoning}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
