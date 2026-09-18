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
