import type {
  DrainType,
  FlowTrend,
  RiskStatus,
  SegmentTelemetry,
  SimulationConfig,
  SimulationEvent,
  SimulationSnapshot,
  SimulationWorkerMessage,
  SimulationWorkerResponse,
  WorkerSegment,
} from "../types";

const SNAP_TOLERANCE = 0.00026;
const TICK_INTERVAL_MS = 900;
const MINUTES_PER_TICK = 2;
const STORM_CENTER = [77.5946, 12.9716] as const;
const TYPE_LEVEL: Record<DrainType, number> = {
  Primary: 0,
  Secondary: 1,
  Tertiary: 2,
};
const CAPACITY_INDEX: Record<DrainType, number> = {
  Primary: 95,
  Secondary: 58,
  Tertiary: 30,
};
const RUNOFF_FACTOR: Record<DrainType, number> = {
  Primary: 0.82,
  Secondary: 0.62,
  Tertiary: 0.42,
};
const CHANNEL_DEPTH_CM: Record<DrainType, number> = {
  Primary: 260,
  Secondary: 165,
  Tertiary: 95,
};
const DESIGN_FLOW_MPS: Record<DrainType, number> = {
  Primary: 3.4,
  Secondary: 2.1,
  Tertiary: 1.05,
};

let segments: WorkerSegment[] = [];
let adjacency: Array<Set<number>> = [];
let indexById = new Map<string, number>();
let previousUtilization = new Float32Array();
let previousStatus: RiskStatus[] = [];
let selectedId: string | null = null;
let connectedSegments = 0;
let blockageDistance = new Map<number, number>();
let tick = 0;
let eventSequence = 0;
let pendingEvents: SimulationEvent[] = [];
let initialized = false;

let config: SimulationConfig = {
  scenario: "normal",
  rainfallMmHr: 8,
  running: true,
  speed: 1,
  blockedId: null,
  elapsedMinutes: 0,
};

function hash01(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function squaredDistance(a: [number, number], b: [number, number]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function bucketKey(lon: number, lat: number) {
  return `${Math.floor(lon / SNAP_TOLERANCE)}:${Math.floor(lat / SNAP_TOLERANCE)}`;
}

function buildGraph() {
  adjacency = segments.map(() => new Set<number>());
  indexById = new Map(segments.map((segment, index) => [segment.id, index]));
  const buckets = new Map<string, Array<{ index: number; point: [number, number] }>>();

  segments.forEach((segment, segmentIndex) => {
    segment.endpoints.forEach((point) => {
      const cellX = Math.floor(point[0] / SNAP_TOLERANCE);
      const cellY = Math.floor(point[1] / SNAP_TOLERANCE);

      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
          const nearby = buckets.get(`${cellX + xOffset}:${cellY + yOffset}`) ?? [];
          for (const candidate of nearby) {
            if (
              candidate.index !== segmentIndex &&
              squaredDistance(point, candidate.point) <= SNAP_TOLERANCE * SNAP_TOLERANCE
            ) {
              adjacency[segmentIndex].add(candidate.index);
              adjacency[candidate.index].add(segmentIndex);
            }
          }
        }
      }

      const key = bucketKey(point[0], point[1]);
      const bucket = buckets.get(key) ?? [];
      bucket.push({ index: segmentIndex, point });
      buckets.set(key, bucket);
    });
  });

  connectedSegments = adjacency.filter((neighbors) => neighbors.size > 0).length;
  previousUtilization = new Float32Array(segments.length);
  previousStatus = segments.map(() => "normal");
}

function rebuildBlockageDistance() {
  blockageDistance = new Map();
  if (config.scenario !== "blockage" || !config.blockedId) return;
  const startIndex = indexById.get(config.blockedId);
  if (startIndex === undefined) return;

  const queue: Array<[number, number]> = [[startIndex, 0]];
  blockageDistance.set(startIndex, 0);

  while (queue.length > 0) {
    const [current, distance] = queue.shift()!;
    if (distance >= 5) continue;
    for (const neighbor of adjacency[current]) {
      if (blockageDistance.has(neighbor)) continue;
      blockageDistance.set(neighbor, distance + 1);
      queue.push([neighbor, distance + 1]);
    }
  }
}

function distanceFromStorm(segment: WorkerSegment) {
  const latitudeScale = Math.cos((segment.center[1] * Math.PI) / 180);
  const dx = (segment.center[0] - STORM_CENTER[0]) * 111 * latitudeScale;
  const dy = (segment.center[1] - STORM_CENTER[1]) * 111;
  return Math.sqrt(dx * dx + dy * dy);
}

function localRainfall(segment: WorkerSegment) {
  const variation = hash01(segment.id);
  if (config.scenario === "cloudburst") {
    const distanceKm = distanceFromStorm(segment);
    const stormCore = Math.exp(-(distanceKm * distanceKm) / (2 * 5.2 * 5.2));
    const ramp = Math.min(1, 0.62 + config.elapsedMinutes / 28);
    const pulse = 0.93 + Math.sin(config.elapsedMinutes / 5 + variation * 5) * 0.07;
    return config.rainfallMmHr * (0.2 + stormCore * 1.02 * ramp) * pulse;
  }
  return config.rainfallMmHr * (0.84 + variation * 0.16);
}

function blockagePressure(segmentIndex: number) {
  const distance = blockageDistance.get(segmentIndex);
  if (distance === undefined) return 0;
  return [0.62, 0.39, 0.24, 0.13, 0.065, 0.025][distance] ?? 0;
}

function statusFor(utilization: number, isBlocked: boolean): RiskStatus {
  if (isBlocked) return "blocked";
  if (utilization >= 0.9) return "critical";
  if (utilization >= 0.68) return "watch";
  return "normal";
}

function makeEvent(
  severity: SimulationEvent["severity"],
  title: string,
  description: string,
  segmentId?: string,
) {
  eventSequence += 1;
  return {
    id: `event-${tick}-${eventSequence}`,
    elapsedMinutes: config.elapsedMinutes,
    severity,
    title,
    description,
    segmentId,
  } satisfies SimulationEvent;
}

function addScenarioEvent() {
  if (config.scenario === "cloudburst") {
    pendingEvents.push(
      makeEvent(
        "info",
        "Cloudburst scenario started",
        `A ${Math.round(config.rainfallMmHr)} mm/hr storm cell is building over central Bengaluru.`,
      ),
    );
  } else if (config.scenario === "blockage") {
    pendingEvents.push(
      makeEvent(
        "watch",
        "Drain obstruction injected",
        `${config.blockedId ?? "The selected segment"} is restricted while runoff continues upstream.`,
        config.blockedId ?? undefined,
      ),
    );
  } else {
    pendingEvents.push(
      makeEvent(
        "info",
        "Network returned to baseline",
        "Rainfall and capacity conditions were reset to the nominal monsoon profile.",
      ),
    );
  }
}

function flowScore(segment: WorkerSegment) {
  return TYPE_LEVEL[segment.type] * 100 + hash01(segment.id) * 10;
}

function selectedRelations() {
  if (!selectedId) return { upstreamIds: [], downstreamIds: [] };
  const currentIndex = indexById.get(selectedId);
  if (currentIndex === undefined) return { upstreamIds: [], downstreamIds: [] };
  const currentScore = flowScore(segments[currentIndex]);
  const upstreamIds: string[] = [];
  const downstreamIds: string[] = [];

  for (const neighborIndex of adjacency[currentIndex]) {
    const neighbor = segments[neighborIndex];
    if (flowScore(neighbor) > currentScore) upstreamIds.push(neighbor.id);
    else downstreamIds.push(neighbor.id);
  }

  return {
    upstreamIds: upstreamIds.slice(0, 8),
    downstreamIds: downstreamIds.slice(0, 8),
  };
}

function emitSnapshot() {
  if (!initialized) return;

  const allTelemetry: SegmentTelemetry[] = [];
  const changedToRisk: SegmentTelemetry[] = [];
  let watchCount = 0;
  let criticalCount = 0;
  let blockedCount = 0;
  let overflowCount = 0;
  let impactedLengthMeters = 0;
  let utilizationTotal = 0;

  segments.forEach((segment, segmentIndex) => {
    const variation = hash01(segment.id);
    const rainfall = localRainfall(segment);
    const baseline = 0.12 + variation * 0.09;
    const rainfallLoad =
      (rainfall / CAPACITY_INDEX[segment.type]) * RUNOFF_FACTOR[segment.type];
    const oscillation =
      Math.sin(config.elapsedMinutes / 7 + variation * Math.PI * 2) * 0.018;
    const isBlocked =
      config.scenario === "blockage" && config.blockedId === segment.id;
    const utilization = Math.max(
      0.05,
      Math.min(1.36, baseline + rainfallLoad + blockagePressure(segmentIndex) + oscillation),
    );
    const status = statusFor(utilization, isBlocked);
    const delta = utilization - previousUtilization[segmentIndex];
    const trend: FlowTrend = delta > 0.018 ? "rising" : delta < -0.018 ? "falling" : "steady";
    const depth = CHANNEL_DEPTH_CM[segment.type];
    const telemetry: SegmentTelemetry = {
      id: segment.id,
      status,
      utilization,
      waterLevelCm: Math.max(4, Math.min(depth * 1.08, utilization * depth * 0.86)),
      flowMps: isBlocked
        ? 0.08
        : DESIGN_FLOW_MPS[segment.type] * Math.min(1.12, 0.22 + utilization),
      localRainfallMmHr: rainfall,
      trend,
    };

    allTelemetry.push(telemetry);
    utilizationTotal += utilization;

    if (status === "watch") watchCount += 1;
    if (status === "critical") criticalCount += 1;
    if (status === "blocked") blockedCount += 1;
    if (utilization >= 1) overflowCount += 1;
    if (status !== "normal") impactedLengthMeters += segment.lengthMeters;

    if (
      config.running &&
      (status === "critical" || status === "blocked") &&
      previousStatus[segmentIndex] !== status
    ) {
      changedToRisk.push(telemetry);
    }

    previousUtilization[segmentIndex] = utilization;
    previousStatus[segmentIndex] = status;
  });

  changedToRisk
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, 3)
    .forEach((telemetry) => {
      pendingEvents.push(
        makeEvent(
          "critical",
          telemetry.status === "blocked" ? "Flow obstruction confirmed" : "Capacity threshold exceeded",
          `${telemetry.id} reached ${Math.round(telemetry.utilization * 100)}% simulated capacity with ${Math.round(telemetry.localRainfallMmHr)} mm/hr local rainfall.`,
          telemetry.id,
        ),
      );
    });

  const affected = allTelemetry.filter((telemetry) => telemetry.status !== "normal");
  const topRisks = [...allTelemetry]
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, 12);
  const selectedTelemetry =
    allTelemetry[indexById.get(selectedId ?? "") ?? -1] ?? null;
  const relations = selectedRelations();

  const snapshot: SimulationSnapshot = {
    tick,
    elapsedMinutes: config.elapsedMinutes,
    rainfallMmHr: config.rainfallMmHr,
    scenario: config.scenario,
    affected,
    topRisks,
    selectedTelemetry,
    upstreamIds: relations.upstreamIds,
    downstreamIds: relations.downstreamIds,
    metrics: {
      watchCount,
      criticalCount,
      blockedCount,
      overflowCount,
      averageUtilization: utilizationTotal / Math.max(1, segments.length),
      impactedLengthMeters,
      connectedSegments,
    },
    events: pendingEvents.splice(0),
  };

  const response: SimulationWorkerResponse = { type: "UPDATE", snapshot };
  self.postMessage(response);
}

function applyControl(patch: Partial<SimulationConfig>) {
  const scenarioChanged = patch.scenario !== undefined && patch.scenario !== config.scenario;
  config = {
    ...config,
    ...patch,
    rainfallMmHr: Math.max(0, Math.min(120, patch.rainfallMmHr ?? config.rainfallMmHr)),
    elapsedMinutes: scenarioChanged
      ? patch.elapsedMinutes ?? 0
      : patch.elapsedMinutes ?? config.elapsedMinutes,
  };
  if (config.scenario !== "blockage") config.blockedId = null;

  if (scenarioChanged) {
    tick = 0;
    previousUtilization.fill(0);
    previousStatus = segments.map(() => "normal");
    addScenarioEvent();
  }

  rebuildBlockageDistance();
  emitSnapshot();
}

self.onmessage = (event: MessageEvent<SimulationWorkerMessage>) => {
  const message = event.data;
  if (message.type === "INIT") {
    segments = message.segments;
    config = message.config;
    selectedId = message.selectedId;
    buildGraph();
    rebuildBlockageDistance();
    initialized = true;
    const ready: SimulationWorkerResponse = { type: "READY", connectedSegments };
    self.postMessage(ready);
    addScenarioEvent();
    emitSnapshot();
    return;
  }

  if (message.type === "CONTROL") {
    applyControl(message.config);
    return;
  }

  if (message.type === "SELECT") {
    selectedId = message.selectedId;
    emitSnapshot();
    return;
  }

  emitSnapshot();
};

self.setInterval(() => {
  if (!initialized || !config.running) return;
  tick += 1;
  config.elapsedMinutes += MINUTES_PER_TICK * config.speed;
  emitSnapshot();
}, TICK_INTERVAL_MS);

export {};


