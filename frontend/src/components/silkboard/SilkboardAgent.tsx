import { useMemo, useRef, useEffect, useState } from "react";
import { DRAIN_NODES, SCENARIO_REFERENCES } from "../../data/silkboard";
import { DispatchModal } from "./DispatchModal";
import { ExecutionTracePanel } from "./ExecutionTrace";
import type {
  AgentDetection,
  ExecutionTrace,
  SilkboardDrainTelemetry,
  SilkboardSnapshot,
} from "../../types";

// ─── Sparkline mini-chart ───────────────────────────────────────────────────

function Sparkline({
  data,
  color,
  height = 28,
  width = 80,
}: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return <div style={{ width, height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Drain sensor card ──────────────────────────────────────────────────────

function DrainCard({
  drain,
  history,
  isSelected,
  onClick,
}: {
  drain: SilkboardDrainTelemetry;
  history: { water_levels: number[]; flow_velocities: number[] } | undefined;
  isSelected: boolean;
  onClick: () => void;
}) {
  const node = DRAIN_NODES.find((n) => n.drain_id === drain.drain_id);
  const statusColor =
    drain.status === "red" ? "#ef4444" : drain.status === "yellow" ? "#f59e0b" : "#22c55e";

  return (
    <button
      type="button"
      className={`drain-sensor-card ${drain.status} ${isSelected ? "is-selected" : ""}`}
      onClick={onClick}
    >
      <div className="drain-card-header">
        <span className="drain-card-id">{drain.drain_id}</span>
        <span className="drain-card-status" style={{ color: statusColor }}>
          <i style={{ background: statusColor }} />
          {drain.status.toUpperCase()}
        </span>
      </div>
      {node && <span className="drain-card-label">{node.label}</span>}
      <div className="drain-card-metrics">
        <div>
          <span>Water</span>
          <strong>{drain.telemetry.water_level_cm.toFixed(0)} cm</strong>
        </div>
        <div>
          <span>Flow</span>
          <strong>{drain.telemetry.flow_velocity_mps.toFixed(2)} m/s</strong>
        </div>
        <div>
          <span>Turbidity</span>
          <strong>{drain.telemetry.turbidity_ntu} NTU</strong>
        </div>
      </div>
      {history && (
        <div className="drain-card-sparklines">
          <Sparkline
            data={history.water_levels}
            color={statusColor}
          />
        </div>
      )}
    </button>
  );
}

// ─── Detection card ─────────────────────────────────────────────────────────

function DetectionCard({
  detection,
  onFocus,
  onOpenDispatch,
}: {
  detection: AgentDetection;
  onFocus: () => void;
  onOpenDispatch: (d: AgentDetection) => void;
}) {
  const node = DRAIN_NODES.find((n) => n.drain_id === detection.drain_id);
  const matchedScenario = detection.matched_scenario
    ? SCENARIO_REFERENCES.find((s) => s.id === detection.matched_scenario)
    : null;

  const classIcon =
    detection.classification === "confirmed_blockage"
      ? "🔴"
      : detection.classification === "probable_blockage"
        ? "🟡"
        : "🟢";

  const classLabel =
    detection.classification === "confirmed_blockage"
      ? "CONFIRMED BLOCKAGE"
      : detection.classification === "probable_blockage"
        ? "PROBABLE BLOCKAGE"
        : "NORMAL RUNOFF";

  const timeAgo = useMemo(() => {
    const diff = Date.now() - new Date(detection.timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  }, [detection.timestamp]);

  return (
    <div className={`agent-detection-card risk-${detection.risk_level}`}>
      <div className="detection-header">
        <span className="detection-class">
          {classIcon} {classLabel}
        </span>
        <div className="detection-meta-right">
          {detection.engine_source === "gemini-live" ? (
            <span className="badge-gemini-live" title="Analyzed with Google Gemini Flash API">
              ⚡ Gemini Live
            </span>
          ) : (
            <span className="badge-heuristic" title="DrainGuard L3 Heuristic Engine">
              ⚙ L3 Core
            </span>
          )}
          <span className="detection-time">{timeAgo}</span>
        </div>
      </div>

      <div className="detection-target">
        <strong>{detection.drain_id}</strong>
        {node && <span>— {node.label}</span>}
        <span className="detection-probability">
          {detection.blockage_probability}% probability
        </span>
      </div>

      {/* Evidence */}
      <div className="detection-evidence">
        <span className="evidence-label">Evidence</span>
        {detection.evidence.slice(0, 5).map((e) => (
          <div key={e.sensor_id + e.label} className="evidence-row">
            <span className="evidence-sensor">{e.sensor_id}</span>
            <span className="evidence-detail">{e.label}: <strong>{e.value}</strong></span>
          </div>
        ))}
      </div>

      {/* Reasoning chain */}
      <div className="detection-reasoning">
        <span className="reasoning-label">Agent Reasoning</span>
        <p>{detection.reasoning}</p>
      </div>

      {/* Visual triage */}
      {detection.visual_result && (
        <div className="detection-visual">
          <span className="visual-label">Visual Triage — {detection.visual_result.camera_id}</span>
          <div className="visual-result-row">
            <span>
              Debris: <strong>{detection.visual_result.debris_class.replace("_", " ")}</strong>
            </span>
            <span>
              Confidence: <strong>{detection.visual_result.confidence}%</strong>
            </span>
          </div>
        </div>
      )}

      {/* Dispatch action */}
      {detection.dispatch_action && (
        <div className="detection-dispatch">
          <div className="dispatch-action-row">
            <div>
              <span className="dispatch-label">→ Recommended Action</span>
              <span className="dispatch-action-text">{detection.dispatch_action}</span>
            </div>
            <button
              type="button"
              className="btn-card-dispatch"
              onClick={() => onOpenDispatch(detection)}
              title="Open WhatsApp field dispatch template"
            >
              📱 Dispatch
            </button>
          </div>
        </div>
      )}

      {/* Scenario match */}
      <div className="detection-footer">
        {matchedScenario ? (
          <span className="scenario-match">
            Matches: {matchedScenario.name}
          </span>
        ) : detection.is_novel ? (
          <span className="scenario-novel">
            ✨ Novel detection — beyond predefined scenarios
          </span>
        ) : null}
        <button type="button" className="detection-focus-btn" onClick={onFocus}>
          🗺 Focus on map
        </button>
      </div>
    </div>
  );
}

// ─── Main agent panel ───────────────────────────────────────────────────────

export function SilkboardAgentPanel({
  snapshot,
  drainHistory,
  selectedDrainId,
  onSelectDrain,
  onTriggerScenario,
  traces,
  activeTraceId,
  onSelectTrace,
}: {
  snapshot: SilkboardSnapshot | null;
  drainHistory: Record<string, { water_levels: number[]; flow_velocities: number[]; turbidities: number[] }>;
  selectedDrainId: string | null;
  onSelectDrain: (id: string) => void;
  onTriggerScenario?: (scenario: "normal" | "heavy_rain" | "blockage" | "inlet_backflow") => void;
  traces?: ExecutionTrace[];
  activeTraceId?: string | null;
  onSelectTrace?: (id: string) => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [dispatchDetection, setDispatchDetection] = useState<AgentDetection | null>(null);
  const [activeTab, setActiveTab] = useState<"trace" | "detections">("trace");

  const effectiveTraces = traces ?? snapshot?.traces ?? [];
  const detections = snapshot?.detections ?? [];

  // When a self-healing event occurs or traces update, keep attention on A1 Gate Trace
  useEffect(() => {
    if (effectiveTraces.length > 0 && effectiveTraces.some((t) => t.self_healing_count > 0)) {
      setActiveTab("trace");
    }
  }, [effectiveTraces, effectiveTraces.length]);

  // Auto-scroll the detection feed
  useEffect(() => {
    if (feedRef.current && detections.length > 0) {
      feedRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [detections.length]);

  const activeAlerts = useMemo(
    () => detections.filter((d) => d.classification !== "normal_runoff"),
    [detections],
  );

  const novelCount = useMemo(
    () => detections.filter((d) => d.is_novel).length,
    [detections],
  );

  if (!snapshot) {
    return (
      <aside className="silkboard-agent-panel">
        <div className="agent-panel-loading">
          <p>Initializing agent reasoning core...</p>
        </div>
      </aside>
    );
  }

  return (
    <>
      <aside className="silkboard-agent-panel">
        {/* Sensor dashboard */}
        <section className="agent-section sensor-dashboard">
          <header className="agent-section-header">
            <div>
              <p className="eyebrow">IoT Sensor Grid</p>
              <h3>Drain Nodes</h3>
            </div>
            <span className="sensor-count">
              {snapshot.drains.filter((d) => d.status !== "green").length} alerting
            </span>
          </header>
          <div className="drain-sensor-grid">
            {snapshot.drains.map((drain) => (
              <DrainCard
                key={drain.drain_id}
                drain={drain}
                history={drainHistory[drain.drain_id]}
                isSelected={selectedDrainId === drain.drain_id}
                onClick={() => onSelectDrain(drain.drain_id)}
              />
            ))}
          </div>
        </section>

        {/* Agent reasoning feed & A1 Execution Trace */}
        <section className="agent-section reasoning-feed">
          <header className="agent-section-header">
            <div className="agent-tab-switch">
              <button
                type="button"
                className={`agent-tab-btn ${activeTab === "trace" ? "is-active" : ""}`}
                onClick={() => setActiveTab("trace")}
                title="A1 Evidence-Gated 5-Gate Execution Trace"
              >
                <span className="tab-icon">⚡</span>
                <span>A1 Gate Trace</span>
                {effectiveTraces.length > 0 && (
                  <span className="tab-badge">{effectiveTraces.length}</span>
                )}
                {effectiveTraces.some((t) => t.self_healing_count > 0) && (
                  <span className="tab-heal-dot" title="Self-healing recovery detected" />
                )}
              </button>

              <button
                type="button"
                className={`agent-tab-btn ${activeTab === "detections" ? "is-active" : ""}`}
                onClick={() => setActiveTab("detections")}
                title="Municipal Incident Detections"
              >
                <span className="tab-icon">🚨</span>
                <span>Detections</span>
                {detections.length > 0 && (
                  <span className="tab-badge">{detections.length}</span>
                )}
              </button>
            </div>

            <div className="detection-stats">
              <div className="agent-cadence-badge" title="Strict 15-second pipeline cadence — Quota protected against rapid API calls">
                <span className="cadence-pulse" />
                <span>15s Cycle</span>
                <span className="cadence-divider">·</span>
                <span className="cadence-status">Quota Guarded</span>
              </div>
              {activeTab === "trace" ? (
                effectiveTraces.length > 0 && (
                  <span className="stat-novel">
                    {effectiveTraces[0]?.self_healing_count > 0 ? "🛡️ Self-Healed" : "✓ Nominal Trace"}
                  </span>
                )
              ) : (
                <>
                  {activeAlerts.length > 0 && (
                    <span className="stat-alert">{activeAlerts.length} active</span>
                  )}
                  {novelCount > 0 && (
                    <span className="stat-novel">✨ {novelCount} novel</span>
                  )}
                </>
              )}
            </div>
          </header>

          {activeTab === "trace" ? (
            <ExecutionTracePanel
              traces={effectiveTraces}
              activeTraceId={activeTraceId ?? null}
              onSelectTrace={onSelectTrace ?? (() => {})}
            />
          ) : (
            <div className="detection-feed" ref={feedRef}>
              {detections.length === 0 ? (
                <div className="detection-empty">
                  <div className="detection-empty-badge">
                    <span className="nominal-dot" />
                    <span>All 10 Drain Nodes Nominal</span>
                  </div>
                  <p>Agent actively monitoring all telemetry channels...</p>
                  <small>
                    The causal disambiguation engine continuously evaluates the 4-signal
                    vector (velocity drop vs level spike vs rainfall vs neighbor graph).
                    To test live reasoning, trigger an incident scenario:
                  </small>
                  {onTriggerScenario && (
                    <div className="detection-empty-actions">
                      <button
                        type="button"
                        className="btn-trigger-scenario blockage"
                        onClick={() => onTriggerScenario("blockage")}
                      >
                        🚫 Trigger Debris Blockage
                      </button>
                      <button
                        type="button"
                        className="btn-trigger-scenario rain"
                        onClick={() => onTriggerScenario("heavy_rain")}
                      >
                        🌧️ Trigger Heavy Rain
                      </button>
                      <button
                        type="button"
                        className="btn-trigger-scenario backflow"
                        onClick={() => onTriggerScenario("inlet_backflow")}
                      >
                        ↩️ Trigger Inlet Surcharge
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                detections.map((detection) => (
                  <DetectionCard
                    key={detection.id}
                    detection={detection}
                    onFocus={() => onSelectDrain(detection.drain_id)}
                    onOpenDispatch={(d) => setDispatchDetection(d)}
                  />
                ))
              )}
            </div>
          )}
        </section>

        {/* Scenario reference */}
        <section className="agent-section scenario-reference">
          <header className="agent-section-header">
            <div>
              <p className="eyebrow">Reference Scenarios</p>
              <h3>Detection Patterns</h3>
            </div>
          </header>
          <div className="scenario-list">
            {SCENARIO_REFERENCES.map((scenario) => {
              const matched = detections.some((d) => d.matched_scenario === scenario.id);
              return (
                <div
                  key={scenario.id}
                  className={`scenario-ref-card ${matched ? "is-matched" : ""}`}
                >
                  <div className="scenario-ref-header">
                    <span className="scenario-ref-id">{scenario.id}</span>
                    <strong>{scenario.name}</strong>
                    {matched && <span className="scenario-matched-badge">ACTIVE</span>}
                  </div>
                  <p>{scenario.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      </aside>

      {dispatchDetection && (
        <DispatchModal
          detection={dispatchDetection}
          onClose={() => setDispatchDetection(null)}
        />
      )}
    </>
  );
}
