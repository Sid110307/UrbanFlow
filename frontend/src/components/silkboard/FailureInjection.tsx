import type { FailureType } from "../../types";

export interface FailureInjectionProps {
  onInjectFailure?: (failure: FailureType) => void;
  onClearFailure?: (failure: FailureType) => void;
  toggleFailure: (failure: FailureType) => void;
  activeFailures: Set<FailureType>;
  onClearAll?: () => void;
}

interface FailureDef {
  id: FailureType;
  icon: string;
  label: string;
  target: string;
  description: string;
  testOutcome: string;
}

const FAILURES: FailureDef[] = [
  {
    id: "camera_offline",
    icon: "📷",
    label: "Kill Camera",
    target: "CAM-02 → OFFLINE",
    description: "CCTV stream loss",
    testOutcome: "G3 Reroute to CAM-01",
  },
  {
    id: "sensor_corrupt",
    icon: "📡",
    label: "Corrupt Sensor",
    target: "SKB-103 → 0.0cm",
    description: "Sensor flatline",
    testOutcome: "G1 Inlet pressure fallback",
  },
  {
    id: "gemini_hallucination",
    icon: "🧠",
    label: "Gemini Hallucinate",
    target: "Force False Normal",
    description: "LLM denial at 92cm",
    testOutcome: "G4 Zero-Trust Override",
  },
  {
    id: "gemini_timeout",
    icon: "🌐",
    label: "Network Timeout",
    target: "API Delay > 4s",
    description: "Cloud partition",
    testOutcome: "G2 Heuristic circuit breaker",
  },
  {
    id: "dispatch_no_ack",
    icon: "📲",
    label: "Dispatch No ACK",
    target: "WhatsApp Silence",
    description: "Field silence",
    testOutcome: "G5 VHF Emergency failover",
  },
];

export function FailureInjectionPanel({
  toggleFailure,
  activeFailures,
  onClearAll,
}: FailureInjectionProps) {
  const activeCount = activeFailures.size;

  return (
    <div className="fault-inject-container">
      <div className="fault-inject-header">
        <div className="fault-inject-title">
          <span className="fault-inject-warn-icon">⚠️</span>
          <span className="fault-inject-label">FAULT INJECTION (A1 DEMO CONTROLS)</span>
        </div>
        {activeCount > 0 && (
          <div className="fault-inject-actions">
            <span className="fault-inject-active-count">
              {activeCount} active fault{activeCount > 1 ? "s" : ""}
            </span>
            {onClearAll && (
              <button
                type="button"
                className="fault-inject-reset-btn"
                onClick={onClearAll}
                title="Clear all active injected faults"
              >
                Reset All
              </button>
            )}
          </div>
        )}
      </div>

      <div className="fault-inject-grid">
        {FAILURES.map((item) => {
          const isActive = activeFailures.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`fault-inject-btn ${isActive ? "is-active" : ""}`}
              onClick={() => toggleFailure(item.id)}
              title={`${item.description} → Tests: ${item.testOutcome}`}
            >
              <div className="fault-inject-btn-top">
                <span className="fault-inject-icon">{item.icon}</span>
                <span className="fault-inject-name">{item.label}</span>
                {isActive && <span className="fault-inject-live-dot" title="Fault Active" />}
              </div>
              <div className="fault-inject-target">{item.target}</div>
              <div className="fault-inject-outcome">
                <span className="outcome-arrow">↳</span> {item.testOutcome}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
