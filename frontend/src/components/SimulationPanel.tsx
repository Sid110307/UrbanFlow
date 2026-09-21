import { formatDistance } from "../drains";
import type {
  ScenarioKind,
  SimulationConfig,
  SimulationSnapshot,
} from "../types";

const SCENARIOS: Array<{
  id: ScenarioKind;
  label: string;
  detail: string;
}> = [
  { id: "normal", label: "Baseline", detail: "8 mm/hr" },
  { id: "cloudburst", label: "Cloudburst", detail: "72 mm/hr" },
  { id: "blockage", label: "Blockage", detail: "Local failure" },
];

function formatSimulationTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function SimulationPanel({
  config,
  snapshot,
  selectedId,
  defaultBlockageId,
  onStartScenario,
  onSetRainfall,
  onSetRunning,
  onSetSpeed,
  onSelect,
}: {
  config: SimulationConfig;
  snapshot: SimulationSnapshot | null;
  selectedId: string | null;
  defaultBlockageId: string | null;
  onStartScenario: (scenario: ScenarioKind, blockedId?: string | null) => void;
  onSetRainfall: (rainfall: number) => void;
  onSetRunning: (running: boolean) => void;
  onSetSpeed: (speed: 1 | 2 | 4) => void;
  onSelect: (id: string) => void;
}) {
  const metrics = snapshot?.metrics;
  const blockedTarget = selectedId ?? defaultBlockageId;

  return (
    <section className="simulation-panel">
      <header className="rail-section-head">
        <div>
          <p className="eyebrow">Scenario engine</p>
          <h2>Live operations</h2>
        </div>
      </header>

      <div className="scenario-grid">
        {SCENARIOS.map((scenario) => (
          <button
            type="button"
            key={scenario.id}
            className={`scenario-card scenario-${scenario.id}${config.scenario === scenario.id ? " active" : ""}`}
            onClick={() =>
              onStartScenario(
                scenario.id,
                scenario.id === "blockage" ? blockedTarget : null,
              )
            }
          >
            <span className="scenario-icon" aria-hidden="true">
              {scenario.id === "normal" ? "N" : scenario.id === "cloudburst" ? "R" : "B"}
            </span>
            <strong>{scenario.label}</strong>
            <small>{scenario.detail}</small>
          </button>
        ))}
      </div>

      <div className="simulation-clock">
        <button
          type="button"
          className="play-button"
          onClick={() => onSetRunning(!config.running)}
          aria-label={config.running ? "Pause simulation" : "Play simulation"}
        >
          {config.running ? "||" : ">"}
        </button>
        <div>
          <span>Scenario time</span>
          <strong>T+ {formatSimulationTime(config.elapsedMinutes)}</strong>
        </div>
        <div className="speed-controls" aria-label="Simulation speed">
          {([1, 2, 4] as const).map((speed) => (
            <button
              type="button"
              key={speed}
              className={config.speed === speed ? "active" : ""}
              onClick={() => onSetSpeed(speed)}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      <label className="rain-control">
        <span>
          Rainfall intensity
          <strong>{Math.round(config.rainfallMmHr)} mm/hr</strong>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={config.rainfallMmHr}
          onChange={(event) => onSetRainfall(Number(event.target.value))}
        />
        <span className="range-labels">
          <small>Dry</small>
          <small>Severe</small>
        </span>
      </label>

      <div className="ops-kpis">
        <div>
          <span>Critical</span>
          <strong className="critical-value">
            {(metrics?.criticalCount ?? 0).toLocaleString("en-IN")}
          </strong>
        </div>
        <div>
          <span>Watch</span>
          <strong className="watch-value">
            {(metrics?.watchCount ?? 0).toLocaleString("en-IN")}
          </strong>
        </div>
        <div>
          <span>Overflow</span>
          <strong>{(metrics?.overflowCount ?? 0).toLocaleString("en-IN")}</strong>
        </div>
        <div>
          <span>Impacted</span>
          <strong>{formatDistance(metrics?.impactedLengthMeters ?? 0)}</strong>
        </div>
      </div>

      {snapshot && snapshot.topRisks.length > 0 && (
        <div className="priority-list">
          <div className="priority-head">
            <span>Priority segments</span>
            <small>Simulated capacity</small>
          </div>
          {snapshot.topRisks.slice(0, 3).map((telemetry) => (
            <button
              type="button"
              key={telemetry.id}
              onClick={() => onSelect(telemetry.id)}
            >
              <i className={`risk-dot status-${telemetry.status}`} />
              <span>{telemetry.id}</span>
              <strong>{Math.round(telemetry.utilization * 100)}%</strong>
            </button>
          ))}
        </div>
      )}

      <p className="simulation-disclosure">
        GIS geometry and recorded lengths are sourced. Hydraulic telemetry is a
        deterministic demo model.
      </p>
    </section>
  );
}
