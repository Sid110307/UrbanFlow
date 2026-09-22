import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigateTo } from "./Root";
import { SilkboardMapView3D as SilkboardMapView } from "./components/silkboard/SilkboardMapView3D";
import { SilkboardAgentPanel } from "./components/silkboard/SilkboardAgent";
import { CameraStrip, CameraDetailModal } from "./components/silkboard/CameraFeed";
import { FailureInjectionPanel } from "./components/silkboard/FailureInjection";
import { useSilkboardSimulation } from "./useSilkboardSimulation";
import { useSilkboardAgent } from "./useSilkboardAgent";
import { loadSilkboardFloodHistory, loadSilkboardRealDrains } from "./silkboardRealData";
import { CAMERAS } from "./silkboard";
import type {
  AgentDetection,
  FailureType,
  SilkboardFloodHistoryPoint,
  SilkboardRealDrainDataset,
  SilkboardScenarioKind,
} from "./types";

const DEMO_SCRIPT: Array<{ label: string; delayMs: number; run: (ctx: DemoContext) => void }> = [
  {
    label: "Resetting to baseline",
    delayMs: 1500,
    run: (ctx) => {
      ctx.clearAllFailures();
      ctx.startScenario("normal");
      ctx.setSpeed(2);
    },
  },
  {
    label: "Triggering a drain blockage",
    delayMs: 3200,
    run: (ctx) => ctx.startScenario("blockage"),
  },
  {
    label: "Killing CAM-02, watch it reroute",
    delayMs: 3200,
    run: (ctx) => ctx.toggleFailure("camera_offline"),
  },
  {
    label: "Forcing Gemini to hallucinate normal",
    delayMs: 3600,
    run: (ctx) => ctx.toggleFailure("gemini_hallucination"),
  },
  {
    label: "Cutting network mid-reasoning",
    delayMs: 3600,
    run: (ctx) => ctx.toggleFailure("gemini_timeout"),
  },
  {
    label: "Silencing the dispatch crew",
    delayMs: 3600,
    run: (ctx) => ctx.toggleFailure("dispatch_no_ack"),
  },
  {
    label: "Corrupting the primary sensor",
    delayMs: 3600,
    run: (ctx) => ctx.toggleFailure("sensor_corrupt"),
  },
  {
    label: "Five simultaneous failures, still green",
    delayMs: 3500,
    run: () => {},
  },
  {
    label: "Recovering",
    delayMs: 2200,
    run: (ctx) => ctx.clearAllFailures(),
  },
  {
    label: "Back to baseline",
    delayMs: 0,
    run: (ctx) => {
      ctx.startScenario("normal");
      ctx.setSpeed(1);
    },
  },
];

interface DemoContext {
  startScenario: (scenario: SilkboardScenarioKind, blockedId?: string | null) => void;
  toggleFailure: (failure: FailureType) => void;
  clearAllFailures: () => void;
  setSpeed: (speed: 1 | 2 | 4) => void;
}

const SCENARIOS: Array<{
  id: SilkboardScenarioKind;
  label: string;
  detail: string;
}> = [
  { id: "normal", label: "Normal", detail: "8 mm/hr" },
  { id: "heavy_rain", label: "Heavy Rain", detail: "65 mm/hr" },
  { id: "blockage", label: "Blockage", detail: "Drain choke" },
  { id: "inlet_backflow", label: "Inlet Backflow", detail: "Drain to road" },
];

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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

export function SilkboardView() {
  const sim = useSilkboardSimulation();
  const [selectedDrainId, setSelectedDrainId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedDetection, setSelectedDetection] = useState<AgentDetection | null>(null);
  const [floodHistory, setFloodHistory] = useState<SilkboardFloodHistoryPoint[]>([]);
  const [realDrains, setRealDrains] = useState<SilkboardRealDrainDataset | null>(null);
  const [demoStep, setDemoStep] = useState<string | null>(null);
  const demoRunIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    loadSilkboardFloodHistory(controller.signal)
      .then((dataset) => setFloodHistory(dataset.features))
      .catch(() => setFloodHistory([]));
    loadSilkboardRealDrains(controller.signal)
      .then(setRealDrains)
      .catch(() => setRealDrains(null));
    return () => controller.abort();
  }, []);

  useSilkboardAgent(
    sim.snapshot,
    sim.drainHistory,
    sim.addDetection,
    sim.addTrace,
    sim.activeFailures,
  );

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

  const runDemo = useCallback(async () => {
    const runId = ++demoRunIdRef.current;
    const ctx: DemoContext = {
      startScenario: sim.startScenario,
      toggleFailure: sim.toggleFailure,
      clearAllFailures: sim.clearAllFailures,
      setSpeed: sim.setSpeed,
    };
    for (const step of DEMO_SCRIPT) {
      if (demoRunIdRef.current !== runId) return;
      setDemoStep(step.label);
      step.run(ctx);
      if (step.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, step.delayMs));
      }
    }
    if (demoRunIdRef.current === runId) setDemoStep(null);
  }, [sim.startScenario, sim.toggleFailure, sim.clearAllFailures, sim.setSpeed]);

  const latestDetectionForCamera = useMemo(() => {
    if (!selectedCameraId || !sim.snapshot) return null;
    return sim.snapshot.detections.find(
      (d) => d.visual_result?.camera_id === selectedCameraId,
    ) ?? null;
  }, [selectedCameraId, sim.snapshot]);

  return (
    <div className="silkboard-shell">
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
            className="silkboard-play-btn"
            onClick={() => sim.setRunning(!sim.config.running)}
            aria-label={sim.config.running ? "Pause" : "Play"}
          >
            {sim.config.running ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            className="silkboard-demo-btn"
            onClick={runDemo}
            disabled={demoStep !== null}
          >
            {demoStep ?? "Run Demo"}
          </button>
          <span className={`live-status${sim.snapshot ? "" : " is-connecting"}`}>
            {sim.snapshot ? "Live" : "Connecting"}
          </span>
          <span className="silkboard-elapsed">
            T+ {formatElapsed(sim.config.elapsed_seconds)}
          </span>
        </div>
      </header>

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

      <main className="silkboard-workspace">
        <section className="silkboard-map-stage">
          <SilkboardMapView
            snapshot={sim.snapshot}
            selectedDrainId={selectedDrainId}
            selectedDetection={selectedDetection}
            onSelectDrain={handleSelectDrain}
            onSelectCamera={handleSelectCamera}
            onSelectDetection={handleSelectDetection}
            floodHistory={floodHistory}
            realDrains={realDrains}
          />
          <CameraStrip
            snapshot={sim.snapshot}
            onSelectCamera={handleSelectCamera}
          />
        </section>

        <SilkboardAgentPanel
          snapshot={sim.snapshot}
          drainHistory={sim.drainHistory}
          selectedDrainId={selectedDrainId}
          onSelectDrain={handleSelectDrain}
          onTriggerScenario={sim.startScenario}
          traces={sim.traces}
          activeTraceId={sim.activeTraceId}
          onSelectTrace={sim.setActiveTraceId}
          onToggleFailure={sim.toggleFailure}
          onClearFailures={sim.clearAllFailures}
          onRunDemo={runDemo}
        />
      </main>

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

      {selectedCameraId && sim.snapshot && (
        <CameraDetailModal
          cameraId={selectedCameraId}
          snapshot={sim.snapshot}
          latestDetection={latestDetectionForCamera}
          onClose={() => setSelectedCameraId(null)}
        />
      )}
    </div>
  );
}
