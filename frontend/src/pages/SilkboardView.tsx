import { useCallback, useMemo, useState } from "react";
import { navigateTo } from "../Root";
import { SilkboardMapView } from "../components/silkboard/SilkboardMapView";
import { SilkboardAgentPanel } from "../components/silkboard/SilkboardAgent";
import { CameraStrip, CameraDetailModal } from "../components/silkboard/CameraFeed";
import { GeminiConfigModal } from "../components/silkboard/GeminiConfigModal";
import { FailureInjectionPanel } from "../components/silkboard/FailureInjection";
import { useSilkboardSimulation } from "../simulation/useSilkboardSimulation";
import { useSilkboardAgent } from "../simulation/useSilkboardAgent";
import { isGeminiActive } from "../services/geminiService";
import { DRAIN_NODES, CAMERAS } from "../data/silkboard";
import type {
  AgentDetection,
  SilkboardScenarioKind,
} from "../types";

// ─── Scenario cards ─────────────────────────────────────────────────────────

const SCENARIOS: Array<{
  id: SilkboardScenarioKind;
  label: string;
  detail: string;
  icon: string;
}> = [
  { id: "normal", label: "Normal", detail: "8 mm/hr", icon: "☀" },
  { id: "heavy_rain", label: "Heavy Rain", detail: "65 mm/hr", icon: "🌧" },
  { id: "blockage", label: "Blockage", detail: "Drain choke", icon: "🚫" },
  { id: "inlet_backflow", label: "Inlet Backflow", detail: "Drain → road", icon: "⬆" },
];

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Metrics bar ────────────────────────────────────────────────────────────

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "yellow" | "red" | "teal";
}) {
  return (
    <div className={`silkboard-metric ${tone ? `tone-${tone}` : ""}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export function SilkboardView() {
  const sim = useSilkboardSimulation();
  const [selectedDrainId, setSelectedDrainId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedDetection, setSelectedDetection] = useState<AgentDetection | null>(null);
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [configCounter, setConfigCounter] = useState(0);

  // Wire up the agent with evidence-gated trace pipeline and fault injection
  useSilkboardAgent(
    sim.snapshot,
    sim.drainHistory,
    sim.addDetection,
    sim.addTrace,
    sim.activeFailures,
  );

  const geminiActive = useMemo(() => isGeminiActive(), [configCounter]);
  const metrics = sim.snapshot?.metrics;

  const handleSelectDrain = useCallback((id: string) => {
    setSelectedDrainId(id);
  }, []);

  const handleSelectCamera = useCallback((id: string) => {
    setSelectedCameraId(id);
  }, []);

  const handleSelectDetection = useCallback((d: AgentDetection) => {
    setSelectedDetection(d);
    setSelectedDrainId(d.drain_id);
  }, []);

  const latestDetectionForCamera = useMemo(() => {
    if (!selectedCameraId || !sim.snapshot) return null;
    return sim.snapshot.detections.find(
      (d) => d.visual_result?.camera_id === selectedCameraId,
    ) ?? null;
  }, [selectedCameraId, sim.snapshot]);

  return (
    <div className="silkboard-shell">
      {/* Header */}
      <header className="silkboard-topbar">
        <div className="silkboard-brand">
          <button
            type="button"
            className="silkboard-back"
            onClick={() => navigateTo("/app")}
            aria-label="Back to city-wide network"
          >
            ← 
          </button>
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="eyebrow">Junction deep-dive</p>
            <h1>Silk Board Junction</h1>
          </div>
        </div>
        <div className="silkboard-topbar-right">
          <button
            type="button"
            className={`btn-gemini-status ${geminiActive ? "is-live" : "is-mock"}`}
            onClick={() => setShowGeminiModal(true)}
            title={
              geminiActive
                ? "Gemini Flash Live API Active — Click to configure"
                : "Configure Google Gemini API key for Live LLM Disambiguation"
            }
          >
            <span className="gemini-status-dot" />
            <span className="gemini-status-text">
              {geminiActive ? "⚡ Gemini Flash (Live)" : "⚙ Gemini AI (Ready)"}
            </span>
          </button>
          <span className={`live-status${sim.snapshot ? "" : " is-connecting"}`}>
            {sim.snapshot ? "Live" : "Connecting"}
          </span>
          <span className="silkboard-elapsed">
            T+ {formatElapsed(sim.config.elapsed_seconds)}
          </span>
        </div>
      </header>

      {/* Metrics bar */}
      <section className="silkboard-metrics-bar" aria-label="Junction overview">
        <MetricChip
          label="Active sensors"
          value={String(metrics?.active_sensors ?? 0)}
        />
        <MetricChip
          label="Alerts"
          value={String(metrics?.alerts ?? 0)}
          tone={metrics && metrics.alerts > 5 ? "red" : metrics && metrics.alerts > 0 ? "yellow" : undefined}
        />
        <MetricChip
          label="Avg water level"
          value={`${(metrics?.avg_water_level_cm ?? 0).toFixed(0)} cm`}
          tone={metrics && metrics.avg_water_level_cm > 60 ? "red" : metrics && metrics.avg_water_level_cm > 35 ? "yellow" : undefined}
        />
        <MetricChip
          label="Drain utilization"
          value={`${Math.round((metrics?.avg_drain_utilization ?? 0) * 100)}%`}
          tone={metrics && metrics.avg_drain_utilization > 0.8 ? "red" : metrics && metrics.avg_drain_utilization > 0.5 ? "yellow" : undefined}
        />
        <MetricChip
          label="Cameras online"
          value={`${metrics?.cameras_online ?? 0} / ${CAMERAS.length}`}
          tone="teal"
        />
        <MetricChip
          label="Risk level"
          value={(metrics?.risk_level ?? "green").toUpperCase()}
          tone={metrics?.risk_level ?? "green"}
        />
        <MetricChip
          label="Self-healed events"
          value={`${metrics?.self_heals ?? 0}`}
          tone={metrics && (metrics.self_heals ?? 0) > 0 ? "green" : undefined}
        />
        <MetricChip
          label="Gates passed"
          value={`${metrics?.gates_passed ?? 5} / 5`}
          tone="teal"
        />
      </section>

      {/* Main workspace */}
      <main className="silkboard-workspace">
        {/* Map stage (center) */}
        <section className="silkboard-map-stage">
          <SilkboardMapView
            snapshot={sim.snapshot}
            selectedDrainId={selectedDrainId}
            selectedDetection={selectedDetection}
            onSelectDrain={handleSelectDrain}
            onSelectCamera={handleSelectCamera}
            onSelectDetection={handleSelectDetection}
          />
          <CameraStrip
            snapshot={sim.snapshot}
            onSelectCamera={handleSelectCamera}
          />
        </section>

        {/* Agent panel (right rail) */}
        <SilkboardAgentPanel
          snapshot={sim.snapshot}
          drainHistory={sim.drainHistory}
          selectedDrainId={selectedDrainId}
          onSelectDrain={handleSelectDrain}
          onTriggerScenario={sim.startScenario}
          traces={sim.traces}
          activeTraceId={sim.activeTraceId}
          onSelectTrace={sim.setActiveTraceId}
        />
      </main>

      {/* Simulation controls & Fault Injection Demo Controls */}
      <footer className="silkboard-controls">
        <div className="silkboard-scenarios-group">
          <div className="silkboard-scenarios">
            {SCENARIOS.map((scenario) => (
              <button
                type="button"
                key={scenario.id}
                className={`silkboard-scenario-btn ${sim.config.scenario === scenario.id ? "active" : ""}`}
                onClick={() => sim.startScenario(scenario.id)}
              >
                <span className="scenario-icon">{scenario.icon}</span>
                <strong>{scenario.label}</strong>
                <small>{scenario.detail}</small>
              </button>
            ))}
          </div>

          <FailureInjectionPanel
            toggleFailure={sim.toggleFailure}
            activeFailures={sim.activeFailures}
            onClearAll={sim.clearAllFailures}
          />
        </div>

        <div className="silkboard-sim-controls">
          <button
            type="button"
            className="silkboard-play-btn"
            onClick={() => sim.setRunning(!sim.config.running)}
            aria-label={sim.config.running ? "Pause" : "Play"}
          >
            {sim.config.running ? "⏸" : "▶"}
          </button>

          <label className="silkboard-rain-control">
            <span>
              Rainfall <strong>{Math.round(sim.config.rainfall_mm_hr)} mm/hr</strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={sim.config.rainfall_mm_hr}
              onChange={(e) => sim.setRainfall(Number(e.target.value))}
            />
          </label>

          <div className="silkboard-speed-controls">
            {([1, 2, 4] as const).map((speed) => (
              <button
                type="button"
                key={speed}
                className={sim.config.speed === speed ? "active" : ""}
                onClick={() => sim.setSpeed(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </footer>

      {/* Camera detail modal */}
      {selectedCameraId && sim.snapshot && (
        <CameraDetailModal
          cameraId={selectedCameraId}
          snapshot={sim.snapshot}
          latestDetection={latestDetectionForCamera}
          onClose={() => setSelectedCameraId(null)}
        />
      )}

      {/* Gemini Agent configuration modal */}
      {showGeminiModal && (
        <GeminiConfigModal
          onClose={() => setShowGeminiModal(false)}
          onConfigSaved={() => setConfigCounter((c) => c + 1)}
        />
      )}
    </div>
  );
}
