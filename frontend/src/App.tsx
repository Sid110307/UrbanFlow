import { useEffect, useState } from "react";
import { api, connectLiveFeed } from "./api";
import { ControlPanel } from "./components/ControlPanel";
import { DrainModal } from "./components/DrainModal";
import { IncidentFeed } from "./components/IncidentFeed";
import { MapView } from "./components/MapView";
import type { Drain, Incident, LiveEvent } from "./types";

function countByStatus(drains: Drain[]) {
  return drains.reduce(
    (acc, d) => {
      acc[d.status] = (acc[d.status] ?? 0) + 1;
      return acc;
    },
    { green: 0, yellow: 0, red: 0 } as Record<Drain["status"], number>
  );
}

export default function App() {
  const [drains, setDrains] = useState<Drain[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedDrainId, setSelectedDrainId] = useState<string | null>(null);
  const [refreshSignals, setRefreshSignals] = useState<Record<string, number>>({});

  useEffect(() => {
    api.listDrains().then(setDrains);
    api.listIncidents(30).then(setIncidents);
  }, []);

  useEffect(() => {
    return connectLiveFeed((event: LiveEvent) => {
      setDrains((prev) =>
        prev.map((d) =>
          d.drain_id === event.drain_id
            ? { ...d, status: event.status, updated_at: new Date().toISOString() }
            : d
        )
      );
      if (event.type === "incident") {
        const incident: Incident = {
          id: Date.now(),
          drain_id: event.drain_id,
          ...event.incident,
        };
        setIncidents((prev) => [incident, ...prev].slice(0, 50));
      }
      setRefreshSignals((prev) => ({
        ...prev,
        [event.drain_id]: (prev[event.drain_id] ?? 0) + 1,
      }));
    });
  }, []);

  const counts = countByStatus(drains);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-top">
          <h1>DrainGuard</h1>
          <span className="subtitle">Causal drain-network monitoring &mdash; Gemini reasoning core</span>
        </div>
        <div className="status-strip">
          <span className="status-strip-item">
            <strong>{drains.length}</strong> nodes tracked
          </span>
          <span className="status-strip-item">
            <span className="status-dot dot-green" />
            <strong>{counts.green}</strong> nominal
          </span>
          <span className="status-strip-item">
            <span className="status-dot dot-yellow" />
            <strong>{counts.yellow}</strong> advisory
          </span>
          <span className="status-strip-item">
            <span className="status-dot dot-red" />
            <strong>{counts.red}</strong> critical
          </span>
        </div>
      </header>

      <div className="app-body">
        <div className="map-pane">
          <MapView drains={drains} onSelect={setSelectedDrainId} />
        </div>
        <aside className="side-pane">
          <ControlPanel drains={drains} />
          <IncidentFeed incidents={incidents} onSelect={setSelectedDrainId} />
        </aside>
      </div>

      {selectedDrainId && (
        <DrainModal
          drainId={selectedDrainId}
          refreshSignal={refreshSignals[selectedDrainId] ?? 0}
          onClose={() => setSelectedDrainId(null)}
        />
      )}
    </div>
  );
}
