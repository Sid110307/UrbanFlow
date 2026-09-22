import { useState, useMemo } from "react";
import type {
  ExecutionTrace,
  GateResult,
  EvidenceItem,
  RecoveryAction,
  GateStatus,
} from "../../types";

export interface ExecutionTracePanelProps {
  traces: ExecutionTrace[];
  activeTraceId: string | null;
  onSelectTrace: (id: string) => void;
}

export function ExecutionTracePanel({
  traces,
  activeTraceId,
  onSelectTrace,
}: ExecutionTracePanelProps) {
  const selectedTrace = useMemo(() => {
    if (!traces || traces.length === 0) return null;
    if (activeTraceId) {
      const found = traces.find((t) => t.trace_id === activeTraceId);
      if (found) return found;
    }
    return traces[0];
  }, [traces, activeTraceId]);

  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);

  const activeGate = useMemo(() => {
    if (!selectedTrace) return null;
    if (selectedGateId) {
      const g = selectedTrace.gates.find((gate) => gate.gate_id === selectedGateId);
      if (g) return g;
    }
    // Default to the first failed or recovered gate, or the latest completed gate
    const healedGate = selectedTrace.gates.find((g) => g.recovery?.executed);
    if (healedGate) return healedGate;
    const failedGate = selectedTrace.gates.find((g) => g.status === "fail");
    if (failedGate) return failedGate;
    return selectedTrace.gates[selectedTrace.gates.length - 1] || selectedTrace.gates[0];
  }, [selectedTrace, selectedGateId]);

  if (!traces || traces.length === 0) {
    return (
      <div className="exec-trace-empty">
        <h4>Zero-Trust Pipeline Ready</h4>
        <p>All 5 Evidence Gates are primed and actively auditing telemetry.</p>
        <div className="exec-trace-gate-preview">
          <span>Anomaly</span>
          <span>→</span>
          <span>Causal</span>
          <span>→</span>
          <span>CCTV</span>
          <span>→</span>
          <span>Cross-Check</span>
          <span>→</span>
          <span>Dispatch</span>
        </div>
        <small>Trigger a simulation scenario or inject a fault below to inspect live execution traces.</small>
      </div>
    );
  }

  return (
    <div className="exec-trace-container">
      <div className="exec-trace-selector">
        {traces.slice(0, 5).map((trace) => {
          const isSelected = selectedTrace?.trace_id === trace.trace_id;
          const isHealed = trace.self_healing_count > 0;
          return (
            <button
              key={trace.trace_id}
              type="button"
              className={`exec-trace-tab ${isSelected ? "is-active" : ""} ${isHealed ? "is-healed" : ""}`}
              onClick={() => {
                onSelectTrace(trace.trace_id);
                setSelectedGateId(null);
              }}
            >
              <div className="exec-trace-tab-top">
                <span className="exec-trace-tab-id">{trace.trace_id}</span>
                <span className={`exec-trace-badge status-${trace.final_status}`}>
                  {trace.final_status.toUpperCase()}
                </span>
              </div>
              <div className="exec-trace-tab-sub">
                <span>{trace.drain_id}</span>
                {isHealed && (
                  <span className="exec-trace-healed-pill" title="Self-healing recovery triggered">
                    Healed ({trace.self_healing_count})
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedTrace && (
        <div className="exec-trace-body">
          <div className="exec-trace-header">
            <div>
              <span className="exec-trace-timestamp">
                {new Date(selectedTrace.started_at).toLocaleTimeString()}
              </span>
              <h4 className="exec-trace-trigger">{selectedTrace.trigger}</h4>
            </div>
            <div className="exec-trace-header-stat">
              <span className="stat-label">Duration</span>
              <strong className="stat-value">{selectedTrace.total_duration_ms}ms</strong>
            </div>
          </div>

          {selectedTrace.was_replanned && (
            <div className="exec-trace-replan-alert">
              <div className="replan-badge">
                <strong>CAUSAL RE-PLANNING EXECUTED</strong>
              </div>
              <div className="replan-diff">
                <div className="replan-row original">
                  <span className="replan-tag">ORIGINAL:</span>
                  <code>{selectedTrace.original_plan.join(" → ")}</code>
                </div>
                <div className="replan-row actual">
                  <span className="replan-tag">ADAPTED:</span>
                  <code>{selectedTrace.actual_plan.join(" → ")}</code>
                </div>
              </div>
            </div>
          )}

          <div className="exec-trace-stepper-wrap">
            <div className="exec-trace-stepper">
              {selectedTrace.gates.map((gate, index) => {
                const isGateSelected = activeGate?.gate_id === gate.gate_id;
                const isHealed = Boolean(gate.recovery?.executed);
                const hasNext = index < selectedTrace.gates.length - 1;

                return (
                  <div key={gate.gate_id} className="exec-trace-step-item">
                    <button
                      type="button"
                      className={`exec-trace-gate-node status-${gate.status} ${isGateSelected ? "is-selected" : ""} ${isHealed ? "is-healed" : ""}`}
                      onClick={() => setSelectedGateId(gate.gate_id)}
                      title={`Click to inspect ${gate.gate_name} evidence`}
                    >
                      <span className="gate-node-id">{gate.gate_id}</span>
                      {isHealed && <span className="gate-node-heal-dot" title="Self-healed" />}
                    </button>
                    <span className="gate-node-label">{gate.gate_name.split(" ")[0]}</span>
                    <span className="gate-node-conf">{gate.confidence}%</span>

                    {hasNext && (
                      <div
                        className={`exec-trace-connector ${
                          gate.status === "pass" ? "connector-pass" : gate.status === "fail" ? "connector-fail" : ""
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {activeGate && (
            <div className="exec-trace-inspector">
              <div className="inspector-header">
                <div className="inspector-title">
                  <div>
                    <h5>
                      {activeGate.gate_id}: {activeGate.gate_name}
                    </h5>
                    <span className="inspector-duration">{activeGate.duration_ms}ms execution time</span>
                  </div>
                </div>
                <div className="inspector-meta">
                  <span className={`inspector-badge status-${activeGate.status}`}>
                    {activeGate.status.toUpperCase()} ({activeGate.passing_count}/{activeGate.total_count})
                  </span>
                </div>
              </div>

              {activeGate.recovery && (
                <div className="exec-trace-recovery-card">
                  <div className="recovery-badge">
                    <span className="recovery-pill">{activeGate.recovery.type.toUpperCase()}</span>
                    <strong>Self-Healing Recovery Action</strong>
                  </div>
                  <p className="recovery-desc">{activeGate.recovery.description}</p>
                  {activeGate.recovery.outcome && (
                    <div className="recovery-outcome">
                      <span className="outcome-label">OUTCOME:</span>
                      <span>{activeGate.recovery.outcome}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedTrace.temporal_chunk && (
                <div className="exec-trace-chunk-card">
                  <div className="chunk-card-header">
                    <div className="chunk-card-title">
                      <span className="chunk-badge">15s CHUNK</span>
                      <strong>Continuous Multi-Sensor Recording Instance</strong>
                    </div>
                    <span className="chunk-samples-tag">
                      {selectedTrace.temporal_chunk.sampleCount} frames · {selectedTrace.temporal_chunk.durationSeconds}s window
                    </span>
                  </div>

                  <div className="chunk-card-grid">
                    <div className="chunk-metric">
                      <span className="chunk-label">Water Rise (dh/dt)</span>
                      <strong className="chunk-val">
                        {selectedTrace.temporal_chunk.startLevel.toFixed(0)} → {selectedTrace.temporal_chunk.endLevel.toFixed(0)} cm
                      </strong>
                      <span className={`chunk-sub ${selectedTrace.temporal_chunk.rateOfRiseCmPerSec > 0.2 ? "is-warn" : ""}`}>
                        {selectedTrace.temporal_chunk.rateOfRiseCmPerSec >= 0 ? "+" : ""}{selectedTrace.temporal_chunk.rateOfRiseCmPerSec.toFixed(2)} cm/s
                      </span>
                    </div>

                    <div className="chunk-metric">
                      <span className="chunk-label">Flow Decel (dv/dt)</span>
                      <strong className="chunk-val">
                        {selectedTrace.temporal_chunk.startVelocity.toFixed(2)} → {selectedTrace.temporal_chunk.endVelocity.toFixed(2)} m/s
                      </strong>
                      <span className={`chunk-sub ${selectedTrace.temporal_chunk.flowDecelerationRate > 0.005 ? "is-warn" : ""}`}>
                        -{selectedTrace.temporal_chunk.flowDecelerationRate.toFixed(3)} m/s²
                      </span>
                    </div>

                    <div className="chunk-metric">
                      <span className="chunk-label">Mass Balance</span>
                      <strong className="chunk-val">
                        {selectedTrace.temporal_chunk.hydraulicAnomalyRatio.toFixed(1)}x Rain Cap
                      </strong>
                      <span className="chunk-sub">
                        {selectedTrace.temporal_chunk.rainfallMmHr.toFixed(1)} mm/hr rain
                      </span>
                    </div>

                    <div className="chunk-metric">
                      <span className="chunk-label">Surface State</span>
                      <strong className="chunk-val">
                        {selectedTrace.temporal_chunk.inletBackflowActive ? "Backflow Active" : "Normal Inflow"}
                      </strong>
                      <span className="chunk-sub">
                        {selectedTrace.temporal_chunk.nearbyPondingSensorsCount} ponding · {selectedTrace.temporal_chunk.maxSurfaceDepthCm.toFixed(1)}cm
                      </span>
                    </div>
                  </div>

                  {selectedTrace.temporal_chunk.waterLevels.length > 1 && (
                    <div className="chunk-progression-row">
                      <span className="progression-tag">15s TRAJECTORY:</span>
                      <div className="progression-bars">
                        {selectedTrace.temporal_chunk.waterLevels.map((lvl, idx) => (
                          <div key={idx} className="progression-bar-col" title={`Frame ${idx + 1}: ${lvl}cm`}>
                            <div
                              className="progression-bar-fill"
                              style={{
                                height: `${Math.min(100, Math.max(15, (lvl / 140) * 100))}%`,
                                backgroundColor: lvl > 75 ? "#dc2626" : lvl > 50 ? "var(--secondary)" : "var(--primary)",
                              }}
                            />
                            <span className="progression-bar-label">{lvl}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="inspector-evidence-list">
                <div className="evidence-list-header">
                  <span>Machine-Checkable Evidence Chain</span>
                  <span className="evidence-count">
                    {activeGate.passing_count} of {activeGate.total_count} assertions verified
                  </span>
                </div>

                {activeGate.evidence.map((item) => {
                  const isPass = item.status === "pass";
                  return (
                    <div key={item.id} className={`evidence-row ${isPass ? "is-pass" : "is-fail"}`}>
                      <div className="evidence-status-icon">
                        {isPass ? "PASS" : "FAIL"}
                      </div>
                      <div className="evidence-details">
                        <div className="evidence-top">
                          <span className="evidence-source">{item.source}</span>
                          <span className="evidence-claim">{item.claim}</span>
                        </div>
                        <div className="evidence-assertion">
                          <span className="assertion-label">ASSERTION:</span>
                          <code>{item.assertion}</code>
                        </div>
                        <div className="evidence-actual">
                          <span className="actual-label">OBSERVED:</span>
                          <span className="actual-val">{item.actual}</span>
                        </div>
                      </div>
                      <div className="evidence-conf">
                        <div className="conf-bar-wrap">
                          <div
                            className="conf-bar"
                            style={{
                              width: `${Math.min(100, Math.max(0, item.confidence))}%`,
                              backgroundColor: isPass ? "var(--primary, #087f75)" : "#dc2626",
                            }}
                          />
                        </div>
                        <span className="conf-num">{item.confidence}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="exec-trace-summary-bar">
            <div className="summary-left">
              {selectedTrace.self_healing_count > 0 ? (
                <span className="summary-chip is-healed">
                  {selectedTrace.self_healing_count} Self-Healing Event{selectedTrace.self_healing_count > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="summary-chip is-nominal">
                  Deterministic Execution
                </span>
              )}
              <span className="summary-chip">
                {selectedTrace.gates.filter((g) => g.status === "pass").length} / 5 Gates Passed
              </span>
            </div>
            <div className="summary-right">
              <span className="summary-duration">{selectedTrace.total_duration_ms}ms total</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
