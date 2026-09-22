import { useEffect, useMemo, useRef, useState } from "react";
import { DRAIN_NODES, SCENARIO_REFERENCES } from "../../silkboard";
import { DispatchModal } from "./DispatchModal";
import { ExecutionTracePanel } from "./ExecutionTrace";
import type {
  AgentDetection,
  ExecutionTrace,
  FailureType,
  SilkboardDrainTelemetry,
  SilkboardSnapshot,
} from "../../types";

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
          {classLabel}
        </span>
        <div className="detection-meta-right">
          {detection.engine_source === "gemini-live" ? (
            <span className="badge-gemini-live" title="Analyzed with Google Gemini Flash API">
              Gemini Live
            </span>
          ) : (
            <span className="badge-heuristic" title="UrbanFlow L3 Heuristic Engine">
              L3 Core
            </span>
          )}
          <span className="detection-time">{timeAgo}</span>
        </div>
      </div>

      <div className="detection-target">
        <strong>{detection.drain_id}</strong>
        {node && <span>{node.label}</span>}
        <span className="detection-probability">
          {detection.blockage_probability}% probability
        </span>
      </div>

      <div className="detection-evidence">
        <span className="evidence-label">Evidence</span>
        {detection.evidence.slice(0, 5).map((e) => (
          <div key={e.sensor_id + e.label} className="evidence-row">
            <span className="evidence-sensor">{e.sensor_id}</span>
            <span className="evidence-detail">{e.label}: <strong>{e.value}</strong></span>
          </div>
        ))}
      </div>

      <div className="detection-reasoning">
        <span className="reasoning-label">Agent Reasoning</span>
        <p>{detection.reasoning}</p>
      </div>

      {detection.visual_result && (
        <div className="detection-visual">
          <span className="visual-label">Visual Triage: {detection.visual_result.camera_id}</span>
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
              Dispatch
            </button>
          </div>
        </div>
      )}

      <div className="detection-footer">
        {matchedScenario ? (
          <span className="scenario-match">
            Matches: {matchedScenario.name}
          </span>
        ) : detection.is_novel ? (
          <span className="scenario-novel">
            Novel detection, beyond predefined scenarios
          </span>
        ) : null}
        <button type="button" className="detection-focus-btn" onClick={onFocus}>
          Focus on map
        </button>
      </div>
    </div>
  );
}

interface ChatAttachment {
  kind: "drains" | "detections" | "trace" | "scenarios";
  drainIds?: string[];
  detectionItems?: AgentDetection[];
}

interface ChatMessage {
  id: number;
  role: "assistant" | "user";
  text: string;
  attachment?: ChatAttachment;
}

const STARTERS = [
  "What needs attention?",
  "Show all drain nodes",
  "Show the gate trace",
  "Trigger a blockage",
  "Run the full demo",
];

const FALLBACK =
  "I didn't catch that. Try: what needs attention, show drain nodes, show the gate trace, show detections, trigger a blockage / heavy rain / inlet backflow, kill a camera, corrupt a sensor, or run the demo.";

const AI_DAILY_LIMIT = 15;
const AI_USAGE_KEY = "urbanflow-silkboard-ai-usage";

function readAiUsageToday(): number {
  try {
    const raw = localStorage.getItem(AI_USAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { day: string; count: number };
    const today = new Date().toISOString().slice(0, 10);
    return parsed.day === today ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function recordAiUsage(count: number) {
  try {
    localStorage.setItem(AI_USAGE_KEY, JSON.stringify({ day: new Date().toISOString().slice(0, 10), count }));
  } catch {
    // ignore
  }
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

export function SilkboardAgentPanel({
  snapshot,
  drainHistory,
  selectedDrainId,
  onSelectDrain,
  onTriggerScenario,
  traces,
  activeTraceId,
  onSelectTrace,
  onToggleFailure,
  onClearFailures,
  onRunDemo,
}: {
  snapshot: SilkboardSnapshot | null;
  drainHistory: Record<string, { water_levels: number[]; flow_velocities: number[]; turbidities: number[] }>;
  selectedDrainId: string | null;
  onSelectDrain: (id: string) => void;
  onTriggerScenario?: (scenario: "normal" | "heavy_rain" | "blockage" | "inlet_backflow") => void;
  traces?: ExecutionTrace[];
  activeTraceId?: string | null;
  onSelectTrace?: (id: string) => void;
  onToggleFailure?: (failure: FailureType) => void;
  onClearFailures?: () => void;
  onRunDemo?: () => void;
}) {
  const [panelTab, setPanelTab] = useState<"assist" | "insights">("assist");
  const [insightsTab, setInsightsTab] = useState<"trace" | "detections">("trace");
  const [dispatchDetection, setDispatchDetection] = useState<AgentDetection | null>(null);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const messageId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text:
        "I'm UrbanFlow Assist for Silk Board Junction. Ask about network status, a specific drain, the evidence-gated trace, or tell me to trigger a scenario or fault.",
    },
  ]);

  const effectiveTraces = traces ?? snapshot?.traces ?? [];
  const detections = snapshot?.detections ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (effectiveTraces.length > 0 && effectiveTraces.some((t) => t.self_healing_count > 0)) {
      setInsightsTab("trace");
    }
  }, [effectiveTraces, effectiveTraces.length]);

  const activeAlerts = useMemo(
    () => detections.filter((d) => d.classification !== "normal_runoff"),
    [detections],
  );

  const novelCount = useMemo(() => detections.filter((d) => d.is_novel).length, [detections]);

  const announcedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const detection of activeAlerts) {
      if (announcedRef.current.has(detection.id)) continue;
      announcedRef.current.add(detection.id);

      const node = DRAIN_NODES.find((n) => n.drain_id === detection.drain_id);
      const severity = detection.classification === "confirmed_blockage" ? "Confirmed" : "Probable";
      const parts = [
        `${severity} incident at ${detection.drain_id}${node ? ` (${node.label})` : ""}: ${detection.blockage_probability}% probability.`,
        detection.reasoning,
      ];
      if (detection.dispatch_action) {
        parts.push(`Recommended: ${detection.dispatch_action}.`);
      }

      messageId.current += 1;
      const alertMsg: ChatMessage = {
        id: messageId.current,
        role: "assistant",
        text: parts.join(" "),
        attachment: { kind: "detections", detectionItems: [detection] },
      };
      setMessages((current) => [...current, alertMsg].slice(-40));
      setPanelTab("assist");
    }
  }, [activeAlerts]);

  function findDrain(id: string): SilkboardDrainTelemetry | undefined {
    return snapshot?.drains.find((d) => d.drain_id === id);
  }

  function respond(raw: string): { text: string; attachment?: ChatAttachment } {
    const text = raw.toLowerCase().trim();
    if (!snapshot) return { text: "Still initializing telemetry, one moment." };

    const isQuestion =
      /\?\s*$/.test(raw.trim()) ||
      /^\s*(why|how|what if|does|do|is|are|can|could|should|explain|compare)\b/.test(text);

    if (/^\s*(hi|hey|hello|yo)[\s!.,]*$/.test(text)) {
      return { text: "Hey. Ask what needs attention, or tell me to trigger a scenario." };
    }

    if (/what can you do|help|commands/.test(text)) {
      return {
        text:
          "I can report network status, show the drain grid, show the evidence-gated gate trace, show detections, look up a drain by ID (e.g. BLR-SKB-103), trigger a scenario (blockage, heavy rain, inlet backflow, normal), inject a fault (camera offline, sensor corrupt, gemini hallucination, gemini timeout, dispatch no-ack), clear faults, or run the full orchestrated demo.",
      };
    }

    const drainMatch = raw.match(/BLR-SKB-\d{3}/i);
    if (drainMatch) {
      const id = drainMatch[0].toUpperCase();
      const drain = findDrain(id);
      const node = DRAIN_NODES.find((n) => n.drain_id === id);
      if (!drain || !node) return { text: `I couldn't find ${id} in this network.` };
      onSelectDrain(id);
      return {
        text: `${id} (${node.label}): ${drain.status.toUpperCase()}, ${drain.telemetry.water_level_cm.toFixed(0)}cm water level, ${drain.telemetry.flow_velocity_mps.toFixed(2)} m/s flow, ${drain.telemetry.turbidity_ntu} NTU turbidity. Focused on the map.`,
        attachment: { kind: "drains", drainIds: [id] },
      };
    }

    if (/show.*(drain|node|sensor)|drain grid|sensor grid|all drains/.test(text)) {
      return { text: `All ${snapshot.drains.length} drain nodes, live:`, attachment: { kind: "drains" } };
    }

    if (/trace|gate|evidence|pipeline/.test(text)) {
      if (effectiveTraces.length === 0) {
        return { text: "No execution trace yet. Trigger a scenario to generate one." };
      }
      const latest = effectiveTraces[0];
      const healed = latest.self_healing_count > 0 ? `, self-healed ${latest.self_healing_count}x` : "";
      return {
        text: `Latest trace ${latest.trace_id} for ${latest.drain_id}: ${latest.final_status}${healed} across ${latest.gates.length} gates.`,
        attachment: { kind: "trace" },
      };
    }

    if (/detection|incident|classif/.test(text)) {
      if (detections.length === 0) {
        return { text: "No detections yet, all drain nodes nominal. Trigger a scenario to see the pipeline reason live." };
      }
      return {
        text: `${detections.length} detection${detections.length === 1 ? "" : "s"} logged, ${activeAlerts.length} active:`,
        attachment: { kind: "detections", detectionItems: detections.slice(0, 4) },
      };
    }

    if (/scenario reference|reference scenario|detection pattern/.test(text)) {
      return { text: "Reference detection patterns the agent recognizes:", attachment: { kind: "scenarios" } };
    }

    if (!isQuestion && /run.*(demo|orchestrat)|full demo/.test(text)) {
      if (!onRunDemo) return { text: "Demo orchestration isn't wired up here." };
      onRunDemo();
      return { text: "Running the full orchestrated demo, watch the topbar and map." };
    }

    if (!isQuestion && /kill.*cam|camera.*(offline|down|kill|fail)|offline.*camera/.test(text)) {
      onToggleFailure?.("camera_offline");
      return { text: "Toggled CAM-02 offline. Watch detection failover reroute around it." };
    }

    if (!isQuestion && /sensor.*(corrupt|fail|bad)|corrupt.*sensor/.test(text)) {
      onToggleFailure?.("sensor_corrupt");
      return { text: "Toggled sensor corruption on a drain node. Watch the outlier exclusion gate." };
    }

    if (!isQuestion && /gemini.*(hallucinat|wrong|lie|contradict)/.test(text)) {
      onToggleFailure?.("gemini_hallucination");
      return { text: "Toggled a forced Gemini hallucination. Watch the zero-trust cross-validation gate." };
    }

    if (!isQuestion && (/gemini.*(timeout|slow|hang)/.test(text) || /network.*cut|cut.*network/.test(text))) {
      onToggleFailure?.("gemini_timeout");
      return { text: "Toggled a simulated Gemini timeout. Watch the fallback to the heuristic engine." };
    }

    if (!isQuestion && /dispatch.*(no ack|silen|fail)|crew.*(silen|down)/.test(text)) {
      onToggleFailure?.("dispatch_no_ack");
      return { text: "Toggled dispatch ACK timeout. Watch the alternate dispatch channel fallback." };
    }

    if (!isQuestion && /clear.*fault|clear.*fail|fix everything|heal everything/.test(text)) {
      onClearFailures?.();
      return { text: "Cleared all injected faults." };
    }

    if (!isQuestion && /^(trigger|start|inject|cause) .*(block|clog|obstruction|choke)|^(block|clog)\b/.test(text)) {
      onTriggerScenario?.("blockage");
      return { text: "Blockage scenario started." };
    }

    if (!isQuestion && /heavy rain|cloudburst|storm|monsoon/.test(text)) {
      onTriggerScenario?.("heavy_rain");
      return { text: "Heavy rain scenario started." };
    }

    if (!isQuestion && /backflow|inlet/.test(text)) {
      onTriggerScenario?.("inlet_backflow");
      return { text: "Inlet backflow scenario started." };
    }

    if (!isQuestion && /reset|baseline|normal conditions|stop scenario/.test(text)) {
      onTriggerScenario?.("normal");
      return { text: "Back to nominal baseline conditions." };
    }

    if (/what needs|attention|status|risk|hotspot|problem/.test(text)) {
      const metrics = snapshot.metrics;
      if (activeAlerts.length === 0) {
        return {
          text: `Network is nominal. Risk level ${metrics.risk_level.toUpperCase()}, ${metrics.cameras_online} cameras online, ${metrics.self_heals ?? 0} self-heals so far.`,
          attachment: { kind: "drains" },
        };
      }
      const top = activeAlerts[0];
      onSelectDrain(top.drain_id);
      return {
        text: `${activeAlerts.length} active alert${activeAlerts.length === 1 ? "" : "s"}, risk level ${metrics.risk_level.toUpperCase()}. Highest priority: ${top.drain_id} at ${top.blockage_probability}% probability. Focused it on the map.`,
        attachment: { kind: "detections", detectionItems: activeAlerts.slice(0, 4) },
      };
    }

    return { text: FALLBACK };
  }

  function buildContextSummary(): string {
    if (!snapshot) return "network still initializing";
    const metrics = snapshot.metrics;
    const parts = [
      `scenario=${snapshot.config.scenario}`,
      `rainfall=${Math.round(snapshot.config.rainfall_mm_hr)}mm/hr`,
      `risk=${metrics.risk_level}`,
      `alerts=${metrics.alerts}`,
      `cameras_online=${metrics.cameras_online}`,
      `self_heals=${metrics.self_heals ?? 0}`,
      `active_failures=${(snapshot.activeFailures ?? []).join(",") || "none"}`,
      selectedDrainId ? `selected=${selectedDrainId}` : "no drain selected",
    ];
    return parts.join("; ");
  }

  function executeTool(name: string, args: Record<string, unknown>): { result: Record<string, unknown>; attachment?: ChatAttachment } {
    if (!snapshot) return { result: { ok: false, error: "not_ready" } };

    switch (name) {
      case "start_scenario": {
        const scenario = args.scenario as "normal" | "heavy_rain" | "blockage" | "inlet_backflow";
        if (!["normal", "heavy_rain", "blockage", "inlet_backflow"].includes(scenario)) {
          return { result: { ok: false, error: "invalid_scenario" } };
        }
        onTriggerScenario?.(scenario);
        return { result: { ok: true, scenario } };
      }
      case "toggle_failure": {
        const failure = args.failure as FailureType;
        onToggleFailure?.(failure);
        return { result: { ok: true, failure } };
      }
      case "clear_failures": {
        onClearFailures?.();
        return { result: { ok: true } };
      }
      case "run_demo": {
        if (!onRunDemo) return { result: { ok: false, error: "not_available" } };
        onRunDemo();
        return { result: { ok: true } };
      }
      case "select_drain": {
        const id = String(args.drain_id ?? "").toUpperCase();
        const drain = findDrain(id);
        if (!drain) return { result: { ok: false, error: "not_found" } };
        onSelectDrain(id);
        return {
          result: { ok: true, drain_id: id, status: drain.status, water_level_cm: drain.telemetry.water_level_cm },
          attachment: { kind: "drains", drainIds: [id] },
        };
      }
      case "get_network_status": {
        const metrics = snapshot.metrics;
        return {
          result: {
            ok: true,
            active_sensors: metrics.active_sensors,
            alerts: metrics.alerts,
            risk_level: metrics.risk_level,
            cameras_online: metrics.cameras_online,
            self_heals: metrics.self_heals ?? 0,
            gates_passed: metrics.gates_passed ?? 0,
            active_failures: snapshot.activeFailures ?? [],
            scenario: snapshot.config.scenario,
          },
        };
      }
      case "get_drain": {
        const id = String(args.drain_id ?? "").toUpperCase();
        const drain = findDrain(id);
        if (!drain) return { result: { ok: false, error: "not_found" } };
        return {
          result: {
            ok: true,
            drain_id: id,
            status: drain.status,
            water_level_cm: drain.telemetry.water_level_cm,
            flow_velocity_mps: drain.telemetry.flow_velocity_mps,
            turbidity_ntu: drain.telemetry.turbidity_ntu,
          },
          attachment: { kind: "drains", drainIds: [id] },
        };
      }
      case "list_drains": {
        return {
          result: {
            ok: true,
            drains: snapshot.drains.map((d) => ({ drain_id: d.drain_id, status: d.status, water_level_cm: d.telemetry.water_level_cm })),
          },
          attachment: { kind: "drains" },
        };
      }
      case "list_detections": {
        const count = Math.max(1, Math.min(8, Number(args.count) || 4));
        const list = detections.slice(0, count);
        return {
          result: { ok: true, count: list.length, detections: list.map((d) => ({ drain_id: d.drain_id, classification: d.classification, probability: d.blockage_probability })) },
          attachment: { kind: "detections", detectionItems: list },
        };
      }
      case "get_trace": {
        if (effectiveTraces.length === 0) return { result: { ok: false, error: "no_trace_yet" } };
        const latest = effectiveTraces[0];
        return {
          result: { ok: true, trace_id: latest.trace_id, drain_id: latest.drain_id, final_status: latest.final_status, self_healing_count: latest.self_healing_count },
          attachment: { kind: "trace" },
        };
      }
      case "list_scenario_references": {
        return { result: { ok: true, scenarios: SCENARIO_REFERENCES.map((s) => s.id) }, attachment: { kind: "scenarios" } };
      }
      default:
        return { result: { ok: false, error: "unknown_tool" } };
    }
  }

  async function callSilkboardAssistant(contents: GeminiContent[]): Promise<GeminiPart[] | null> {
    try {
      const response = await fetch("/.netlify/functions/silkboard-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { parts?: GeminiPart[] };
      return Array.isArray(data.parts) ? data.parts : null;
    } catch {
      return null;
    }
  }

  async function runAgenticTurn(message: string): Promise<{ text: string; attachment?: ChatAttachment } | null> {
    const used = readAiUsageToday();
    if (used >= AI_DAILY_LIMIT) return null;

    let contents: GeminiContent[] = [
      { role: "user", parts: [{ text: `${message}\n\nLive snapshot: ${buildContextSummary()}` }] },
    ];
    let attachment: ChatAttachment | undefined;

    for (let round = 0; round < 3; round += 1) {
      const parts = await callSilkboardAssistant(contents);
      if (!parts) return null;

      const calls = parts.filter((part): part is GeminiPart & { functionCall: NonNullable<GeminiPart["functionCall"]> } =>
        Boolean(part.functionCall),
      );
      const textPart = parts.find((part) => typeof part.text === "string" && part.text.trim());

      if (calls.length === 0) {
        if (!textPart?.text) return null;
        recordAiUsage(used + 1);
        return { text: textPart.text.trim(), attachment };
      }

      const responses = calls.map((call) => {
        const { result, attachment: att } = executeTool(call.functionCall.name, call.functionCall.args ?? {});
        if (att) attachment = att;
        return { name: call.functionCall.name, response: result };
      });

      contents = [
        ...contents,
        { role: "model", parts: calls.map((call) => ({ functionCall: call.functionCall })) },
        { role: "user", parts: responses.map((r) => ({ functionResponse: r })) },
      ];
    }

    recordAiUsage(used + 1);
    return { text: "I ran a few checks but couldn't wrap up a final answer, try asking again.", attachment };
  }

  async function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || thinking) return;
    messageId.current += 1;
    const userMsg: ChatMessage = { id: messageId.current, role: "user", text: trimmed };
    setMessages((current) => [...current, userMsg]);
    setInput("");

    let { text, attachment } = respond(trimmed);
    if (text === FALLBACK) {
      setThinking(true);
      const smart = await runAgenticTurn(trimmed);
      setThinking(false);
      if (smart) {
        text = smart.text;
        attachment = smart.attachment;
      }
    }

    messageId.current += 1;
    const replyMsg: ChatMessage = { id: messageId.current, role: "assistant", text, attachment };
    setMessages((current) => [...current, replyMsg].slice(-40));
  }

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
        <div className="agent-tab-switch">
          <button
            type="button"
            className={`agent-tab-btn ${panelTab === "assist" ? "is-active" : ""}`}
            onClick={() => setPanelTab("assist")}
          >
            <span>AI Assist</span>
          </button>
          <button
            type="button"
            className={`agent-tab-btn ${panelTab === "insights" ? "is-active" : ""}`}
            onClick={() => setPanelTab("insights")}
          >
            <span>Insights</span>
            {effectiveTraces.some((t) => t.self_healing_count > 0) && (
              <span className="tab-heal-dot" title="Self-healing recovery detected" />
            )}
          </button>
        </div>

        {panelTab === "insights" ? (
          <div className="silk-insights">
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

            <section className="agent-section reasoning-feed">
              <header className="agent-section-header">
                <div className="agent-tab-switch">
                  <button
                    type="button"
                    className={`agent-tab-btn ${insightsTab === "trace" ? "is-active" : ""}`}
                    onClick={() => setInsightsTab("trace")}
                    title="A1 Evidence-Gated 5-Gate Execution Trace"
                  >
                    <span>Gate Trace</span>
                    {effectiveTraces.length > 0 && <span className="tab-badge">{effectiveTraces.length}</span>}
                  </button>
                  <button
                    type="button"
                    className={`agent-tab-btn ${insightsTab === "detections" ? "is-active" : ""}`}
                    onClick={() => setInsightsTab("detections")}
                    title="Municipal Incident Detections"
                  >
                    <span>Detections</span>
                    {detections.length > 0 && <span className="tab-badge">{detections.length}</span>}
                  </button>
                </div>
                {insightsTab === "detections" && novelCount > 0 && (
                  <span className="stat-novel">{novelCount} novel</span>
                )}
              </header>

              {insightsTab === "trace" ? (
                <ExecutionTracePanel
                  traces={effectiveTraces}
                  activeTraceId={activeTraceId ?? null}
                  onSelectTrace={onSelectTrace ?? (() => {})}
                />
              ) : (
                <div className="detection-feed">
                  {detections.length === 0 ? (
                    <div className="detection-empty">
                      <p>All drain nodes nominal. Trigger a scenario to see the pipeline reason live.</p>
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
                    <div key={scenario.id} className={`scenario-ref-card ${matched ? "is-matched" : ""}`}>
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
          </div>
        ) : (
          <>
        <div className="silk-chat-messages" ref={scrollRef}>
          {messages.map((message) => (
              <div key={message.id} className={`silk-chat-message ${message.role}`}>
                <p>{message.text}</p>
                {message.attachment?.kind === "drains" && (
                  <div className="drain-sensor-grid silk-chat-attachment">
                    {snapshot.drains
                      .filter((d) => !message.attachment?.drainIds || message.attachment.drainIds.includes(d.drain_id))
                      .map((drain) => (
                        <DrainCard
                          key={drain.drain_id}
                          drain={drain}
                          history={drainHistory[drain.drain_id]}
                          isSelected={selectedDrainId === drain.drain_id}
                          onClick={() => onSelectDrain(drain.drain_id)}
                        />
                      ))}
                  </div>
                )}
                {message.attachment?.kind === "detections" && (
                  <div className="silk-chat-attachment">
                    {(message.attachment.detectionItems ?? []).map((detection) => (
                      <DetectionCard
                        key={detection.id}
                        detection={detection}
                        onFocus={() => onSelectDrain(detection.drain_id)}
                        onOpenDispatch={(d) => setDispatchDetection(d)}
                      />
                    ))}
                  </div>
                )}
                {message.attachment?.kind === "trace" && (
                  <div className="silk-chat-attachment">
                    <ExecutionTracePanel
                      traces={effectiveTraces}
                      activeTraceId={activeTraceId ?? null}
                      onSelectTrace={onSelectTrace ?? (() => {})}
                    />
                  </div>
                )}
                {message.attachment?.kind === "scenarios" && (
                  <div className="scenario-list silk-chat-attachment">
                    {SCENARIO_REFERENCES.map((scenario) => {
                      const matched = detections.some((d) => d.matched_scenario === scenario.id);
                      return (
                        <div key={scenario.id} className={`scenario-ref-card ${matched ? "is-matched" : ""}`}>
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
                )}
              </div>
          ))}
          {thinking && (
            <div className="silk-chat-message assistant thinking">
              <p><i /><i /><i /></p>
            </div>
          )}
        </div>

        <div className="silk-chat-starters">
          {STARTERS.map((starter) => (
            <button type="button" key={starter} onClick={() => submit(starter)}>
              {starter}
            </button>
          ))}
        </div>

        <form
          className="silk-chat-input"
          onSubmit={(event) => {
            event.preventDefault();
            submit(input);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about a drain, a fault, or a scenario..."
            aria-label="Message UrbanFlow Assist"
          />
          <button type="submit" disabled={!input.trim() || thinking} aria-label="Send message">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 14-7-4.8 14-2.7-5.5L5 12Z" />
            </svg>
          </button>
        </form>
          </>
        )}
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
