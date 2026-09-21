export const DRAIN_TYPES = ["Primary", "Secondary", "Tertiary"] as const;

export type DrainType = (typeof DRAIN_TYPES)[number];
export type Coordinate = [number, number];
export type Bounds = [number, number, number, number];

export interface DrainProperties {
  id: string;
  label: string;
  type: DrainType;
  lengthMeters: number;
  sourceId: string;
  refName?: string;
  entity?: string;
  originalVertices: number;
  displayVertices: number;
  bounds: Bounds;
  center: Coordinate;
}

export interface DrainFeature {
  type: "Feature";
  geometry:
    | { type: "LineString"; coordinates: Coordinate[] }
    | { type: "MultiLineString"; coordinates: Coordinate[][] };
  properties: DrainProperties;
}

export interface DrainCategorySummary {
  count: number;
  lengthMeters: number;
  originalVertices: number;
  displayVertices: number;
}

export interface DrainDataset {
  type: "FeatureCollection";
  metadata: {
    title: string;
    sourceName: string;
    sourceUrl: string;
    downloadUrl: string;
    dataUpdated: string;
    totalFeatures: number;
    totalLengthMeters: number;
    originalVertices: number;
    displayVertices: number;
    bounds: Bounds;
    categories: Record<DrainType, DrainCategorySummary>;
  };
  features: DrainFeature[];
}

export type DrainTypeVisibility = Record<DrainType, boolean>;

export type ScenarioKind = "normal" | "cloudburst" | "blockage";
export type RiskStatus = "normal" | "watch" | "critical" | "blocked";
export type FlowTrend = "falling" | "steady" | "rising";

export interface SimulationConfig {
  scenario: ScenarioKind;
  rainfallMmHr: number;
  running: boolean;
  speed: 1 | 2 | 4;
  blockedId: string | null;
  elapsedMinutes: number;
}

export interface SegmentTelemetry {
  id: string;
  status: RiskStatus;
  utilization: number;
  waterLevelCm: number;
  flowMps: number;
  localRainfallMmHr: number;
  trend: FlowTrend;
}

export interface TelemetryPoint extends SegmentTelemetry {
  elapsedMinutes: number;
}

export interface NetworkMetrics {
  watchCount: number;
  criticalCount: number;
  blockedCount: number;
  overflowCount: number;
  averageUtilization: number;
  impactedLengthMeters: number;
  connectedSegments: number;
}

export interface SimulationEvent {
  id: string;
  elapsedMinutes: number;
  severity: "info" | "watch" | "critical";
  title: string;
  description: string;
  segmentId?: string;
}

export interface SimulationSnapshot {
  tick: number;
  elapsedMinutes: number;
  rainfallMmHr: number;
  scenario: ScenarioKind;
  affected: SegmentTelemetry[];
  topRisks: SegmentTelemetry[];
  selectedTelemetry: SegmentTelemetry | null;
  upstreamIds: string[];
  downstreamIds: string[];
  metrics: NetworkMetrics;
  events: SimulationEvent[];
}

export interface WorkerSegment {
  id: string;
  type: DrainType;
  lengthMeters: number;
  center: Coordinate;
  endpoints: [Coordinate, Coordinate];
}

export type SimulationWorkerMessage =
  | {
      type: "INIT";
      segments: WorkerSegment[];
      config: SimulationConfig;
      selectedId: string | null;
    }
  | { type: "CONTROL"; config: Partial<SimulationConfig> }
  | { type: "SELECT"; selectedId: string | null }
  | { type: "SNAPSHOT" };

export type SimulationWorkerResponse =
  | { type: "READY"; connectedSegments: number }
  | { type: "UPDATE"; snapshot: SimulationSnapshot };

// ─── Silkboard Junction IoT Types ───────────────────────────────────────────

export type SilkboardScenarioKind = "normal" | "heavy_rain" | "blockage" | "inlet_backflow";
export type AnomalyClassification = "normal_runoff" | "probable_blockage" | "confirmed_blockage";
export type DebrisClass = "plastic" | "silt" | "construction_debris";
export type SilkboardRiskLevel = "green" | "yellow" | "red";
export type InletFlowDirection = "inward" | "stagnant" | "backflow";
export type InletStatus = "normal" | "surging" | "backflow" | "blocked";
export type RoadSensorStatus = "dry" | "damp" | "pooling" | "flooding";
export type CameraStatus = "online" | "alert" | "offline";

/** Drain node — matches §5.1 payload shape */
export interface SilkboardDrainNode {
  drain_id: string;
  position: Coordinate;
  label: string;
  capacity_liters_per_sec: number;
  connected_city_drain_id: string | null;
}

/** Road surface IoT sensor */
export interface SilkboardRoadSensor {
  id: string;
  drain_node_id: string;
  position: Coordinate;
  type: "water_level" | "flow" | "pressure";
}

/** Peripheral drain segment (the dark-blue ring) */
export interface SilkboardPeripheralDrain {
  id: string;
  name?: string;
  coordinates: Coordinate[];
  capacity_liters_per_sec: number;
  connected_city_drain_id: string;
}

/** Elevated flyover bridge structures from flyover.geojson */
export interface SilkboardFlyoverSegment {
  id: string;
  name: string;
  highway: string;
  layer: number;
  bridge: string;
  coordinates: Coordinate[];
}

/** Drain inlet (the red dots) */
export interface SilkboardDrainInlet {
  id: string;
  drain_segment_id: string;
  position: Coordinate;
  type: "surface_inlet" | "grate" | "curb_opening";
}

/** CCTV camera */
export interface SilkboardCamera {
  id: string;
  label: string;
  position: Coordinate;
  bearing: number;
  coverage_angle: number;
  coverage_radius: number;
}

/** Scenario reference data for the agent */
export interface SilkboardScenarioRef {
  id: string;
  name: string;
  description: string;
  trigger_conditions: string[];
  expected_agent_action: string;
}

// ─── Silkboard Simulation Telemetry ─────────────────────────────────────────

/** Per-drain telemetry — matches §5.1 */
export interface SilkboardDrainTelemetry {
  drain_id: string;
  timestamp: string;
  telemetry: {
    water_level_cm: number;
    flow_velocity_mps: number;
    turbidity_ntu: number;
  };
  weather: {
    precip_rate_mm_hr: number;
    upstream_precip_mm_hr: number;
  };
  status: SilkboardRiskLevel;
}

/** Per-road-sensor reading */
export interface SilkboardRoadSensorReading {
  sensor_id: string;
  water_depth_cm: number;
  status: RoadSensorStatus;
  timestamp: string;
}

/** Per-inlet reading */
export interface SilkboardInletReading {
  inlet_id: string;
  flow_direction: InletFlowDirection;
  flow_rate_lps: number;
  status: InletStatus;
}

/** Per-camera state */
export interface SilkboardCameraState {
  camera_id: string;
  status: CameraStatus;
  last_detection: string | null;
  detection_active: boolean;
  waterlogging_confidence: number;
}

// ─── Silkboard Agent Types ──────────────────────────────────────────────────

/** Causal judgment — matches §5.2 function-calling schema */
export interface CausalJudgment {
  drain_id: string;
  classification: AnomalyClassification;
  blockage_probability: number;
  reasoning: string;
  trigger_visual_triage: boolean;
  engine_source?: "gemini-live" | "heuristic";
}

/** Visual triage result */
export interface VisualTriageResult {
  camera_id: string;
  debris_class: DebrisClass;
  confidence: number;
  frame_index: number;
}

/** Full agent detection */
export interface AgentDetection {
  id: string;
  timestamp: string;
  drain_id: string;
  classification: AnomalyClassification;
  blockage_probability: number;
  reasoning: string;
  evidence: Array<{ sensor_id: string; label: string; value: string; }>;
  risk_level: SilkboardRiskLevel;
  visual_result: VisualTriageResult | null;
  dispatch_action: string | null;
  matched_scenario: string | null;
  is_novel: boolean;
  engine_source?: "gemini-live" | "heuristic";
}

// ─── Silkboard Simulation Snapshot ──────────────────────────────────────────

export interface SilkboardMetrics {
  active_sensors: number;
  alerts: number;
  avg_water_level_cm: number;
  avg_drain_utilization: number;
  cameras_online: number;
  risk_level: SilkboardRiskLevel;
  self_heals?: number;
  gates_passed?: number;
}

export interface SilkboardSimConfig {
  scenario: SilkboardScenarioKind;
  rainfall_mm_hr: number;
  running: boolean;
  speed: 1 | 2 | 4;
  blocked_drain_id: string | null;
  elapsed_seconds: number;
}

export interface SilkboardSnapshot {
  tick: number;
  timestamp: string;
  drains: SilkboardDrainTelemetry[];
  road_sensors: SilkboardRoadSensorReading[];
  inlets: SilkboardInletReading[];
  cameras: SilkboardCameraState[];
  detections: AgentDetection[];
  traces?: ExecutionTrace[];
  activeFailures?: FailureType[];
  metrics: SilkboardMetrics;
  config: SilkboardSimConfig;
}

// ─── A1: Evidence-Gated Self-Healing Workflow Types ─────────────────────────

export interface TemporalChunkRecording {
  durationSeconds: number;     // e.g. 15s window
  sampleCount: number;         // number of temporal frames (e.g. 8)
  waterLevels: number[];       // sequential level readings over 15s
  flowVelocities: number[];    // sequential velocity readings over 15s
  turbidities: number[];       // sequential turbidity readings over 15s
  rateOfRiseCmPerSec: number;  // hydraulic rise gradient (cm/s)
  flowDecelerationRate: number;// hydraulic choke deceleration (m/s²)
  turbidityRateOfChange: number;// NTU/s
  startLevel: number;
  endLevel: number;
  startVelocity: number;
  endVelocity: number;
  // Multi-sensor spatial & environmental correlations across the 15s chunk:
  rainfallMmHr: number;
  expectedRainRiseRate: number;
  hydraulicAnomalyRatio: number;
  upstreamDownstreamGradientCm?: number;
  inletBackflowActive: boolean;
  inletBackflowRateLps: number;
  nearbyPondingSensorsCount: number;
  maxSurfaceDepthCm: number;
  hydraulicChokeSignature: boolean;
}

export type EvidenceCheckStatus = "pass" | "fail" | "pending";

export interface EvidenceItem {
  id: string;
  source: string;             // e.g. "sensor:BLR-SKB-103", "gemini:flash", "camera:CAM-02"
  claim: string;              // Human-readable: "Water level exceeds 75cm threshold"
  assertion: string;          // Machine-checkable assertion: "water_level_cm > 75"
  actual: string;             // Actual observed value: "92 cm"
  status: EvidenceCheckStatus;
  confidence: number;         // 0-100
  timestamp?: string;
}

export type GateStatus = "pass" | "fail" | "partial" | "running" | "pending" | "skipped";

export interface RecoveryAction {
  type: "retry" | "fallback" | "escalate" | "re-plan" | "abort";
  description: string;        // Human-readable: "Falling back to heuristic engine"
  outcome: string | null;     // Outcome summary: "Heuristic engine returned: probable_blockage (72%)"
  executed: boolean;
}

export interface GateResult {
  gate_id: string;            // "G1" through "G5"
  gate_name: string;          // "Anomaly Detection", "Causal Disambiguation", etc.
  gate_icon: string;          // emoji: "📡", "🧠", "📷", "⚖️", "📲"
  status: GateStatus;
  evidence: EvidenceItem[];
  passing_count: number;
  total_count: number;
  confidence: number;         // 0-100 aggregate gate confidence
  failure_reason: string | null;
  recovery: RecoveryAction | null;
  duration_ms: number;
}

export interface ExecutionTrace {
  trace_id: string;           // "TRACE-0001"
  drain_id: string;           // "BLR-SKB-103"
  trigger: string;            // "Water level anomaly at BLR-SKB-103 (92cm, rising)"
  started_at: string;         // ISO timestamp
  gates: GateResult[];        // Always 5 gates in order
  original_plan: string[];    // ["detect", "classify", "verify", "validate", "dispatch"]
  actual_plan: string[];      // May differ if re-planned
  was_replanned: boolean;
  final_status: "completed" | "recovered" | "aborted" | "in_progress";
  self_healing_count: number;
  total_duration_ms: number;
  temporal_chunk?: TemporalChunkRecording;
}

export type FailureType =
  | "camera_offline"        // Kill CAM-02 -> tests camera rerouting recovery
  | "sensor_corrupt"        // Sensor BLR-SKB-103 returns 0s -> tests sensor outlier exclusion
  | "gemini_hallucination"  // Force Gemini to contradict sensors -> tests zero-trust cross-validation
  | "gemini_timeout"        // Simulate Gemini API timeout (>4s) -> tests fallback to heuristic engine
  | "dispatch_no_ack";      // Dispatch ACK timeout -> tests alternate dispatch channel fallback
