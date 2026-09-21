import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAMERAS,
  DRAIN_INLETS,
  DRAIN_NODES,
  PERIPHERAL_DRAINS,
  ROAD_SENSORS,
} from "../data/silkboard";
import type {
  SilkboardCameraState,
  SilkboardDrainTelemetry,
  SilkboardInletReading,
  SilkboardMetrics,
  SilkboardRoadSensorReading,
  SilkboardScenarioKind,
  SilkboardSimConfig,
  SilkboardSnapshot,
  SilkboardRiskLevel,
  AgentDetection,
  FailureType,
  ExecutionTrace,
} from "../types";

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SilkboardSimConfig = {
  scenario: "normal",
  rainfall_mm_hr: 8,
  running: true,
  speed: 1,
  blocked_drain_id: null,
  elapsed_seconds: 0,
};

const TICK_INTERVAL_MS = 2000; // 2 seconds per tick

// ─── Noise helpers ──────────────────────────────────────────────────────────

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Telemetry generators ───────────────────────────────────────────────────

function generateDrainTelemetry(
  tick: number,
  config: SilkboardSimConfig,
  activeFailures?: Set<FailureType>,
): SilkboardDrainTelemetry[] {
  return DRAIN_NODES.map((node, i) => {
    const baseRain = config.rainfall_mm_hr;
    const rainFactor = baseRain / 100;
    const noise = seededNoise(tick * 100 + i * 7);
    const noise2 = seededNoise(tick * 100 + i * 13 + 50);

    // Baseline water level driven by rainfall
    let waterLevel = 10 + rainFactor * 80 + noise * 12;
    let flowVelocity = 0.3 + rainFactor * 2.0 + noise2 * 0.3;
    let turbidity = 50 + rainFactor * 400 + noise * 80;

    // Scenario-specific modifiers
    if (config.scenario === "blockage" && config.blocked_drain_id === node.drain_id) {
      // Blocked drain: water backs up, flow drops to near zero
      waterLevel = 90 + tick * 0.5 + noise * 5;
      flowVelocity = 0.02 + noise2 * 0.03;
      turbidity = 600 + noise * 150;
    } else if (config.scenario === "blockage" && config.blocked_drain_id) {
      // Neighbor of blocked drain — check proximity
      const blockedNode = DRAIN_NODES.find((n) => n.drain_id === config.blocked_drain_id);
      if (blockedNode) {
        const dist = Math.sqrt(
          (node.position[0] - blockedNode.position[0]) ** 2 +
          (node.position[1] - blockedNode.position[1]) ** 2,
        );
        if (dist < 0.004) {
          // Upstream backup effect
          const backupFactor = 1 - dist / 0.004;
          waterLevel += backupFactor * 40;
          flowVelocity *= (1 - backupFactor * 0.7);
        }
      }
    } else if (config.scenario === "heavy_rain") {
      waterLevel += 30 + Math.sin(tick * 0.1 + i) * 15;
      flowVelocity += 0.8 + Math.sin(tick * 0.15 + i) * 0.3;
      turbidity += 200;
    } else if (config.scenario === "inlet_backflow") {
      // Specific drains get overloaded, causing backflow at inlets
      if (i === 2 || i === 4 || i === 8) {
        waterLevel = 110 + noise * 10;
        flowVelocity = 0.1 + noise2 * 0.05;
        turbidity = 700 + noise * 100;
      }
    }

    // Injected Fault: Corrupt sensor flatlines to 0
    if (activeFailures?.has("sensor_corrupt") && node.drain_id === "BLR-SKB-103") {
      waterLevel = 0;
      flowVelocity = 0;
      turbidity = 0;
    }

    waterLevel = clamp(waterLevel, 0, 150);
    flowVelocity = clamp(flowVelocity, 0, 3.0);
    turbidity = clamp(turbidity, 0, 1000);

    const utilization = waterLevel / (node.capacity_liters_per_sec * 0.3);
    let status: SilkboardRiskLevel = "green";
    if (utilization > 0.9) status = "red";
    else if (utilization > 0.65) status = "yellow";

    const precipNoise = seededNoise(tick * 50 + i * 3);
    const precipRate = baseRain + precipNoise * 5 - 2.5;

    return {
      drain_id: node.drain_id,
      timestamp: new Date(Date.now() - (100 - tick) * TICK_INTERVAL_MS).toISOString(),
      telemetry: {
        water_level_cm: Math.round(waterLevel * 10) / 10,
        flow_velocity_mps: Math.round(flowVelocity * 100) / 100,
        turbidity_ntu: Math.round(turbidity),
      },
      weather: {
        precip_rate_mm_hr: Math.round(clamp(precipRate, 0, 100) * 10) / 10,
        upstream_precip_mm_hr: Math.round(clamp(precipRate * 0.85 + precipNoise * 3, 0, 100) * 10) / 10,
      },
      status,
    };
  });
}

function generateRoadSensorReadings(
  tick: number,
  config: SilkboardSimConfig,
  drainTelemetry: SilkboardDrainTelemetry[],
): SilkboardRoadSensorReading[] {
  return ROAD_SENSORS.map((sensor, i) => {
    const drainData = drainTelemetry.find((d) => d.drain_id === sensor.drain_node_id);
    const drainLevel = drainData?.telemetry.water_level_cm ?? 20;
    const noise = seededNoise(tick * 200 + i * 11);

    // Road sensor water depth correlates with nearby drain level
    let waterDepth = (drainLevel / 150) * 8 + noise * 2;

    // If drain is overloaded, road gets flooded
    if (drainData && drainData.status === "red") {
      waterDepth = 5 + (drainLevel - 90) * 0.15 + noise * 3;
    }

    // Inlet backflow scenario — water comes from drains onto road
    if (config.scenario === "inlet_backflow") {
      const nearInlet = DRAIN_INLETS.find((inlet) => {
        const dist = Math.sqrt(
          (inlet.position[0] - sensor.position[0]) ** 2 +
          (inlet.position[1] - sensor.position[1]) ** 2,
        );
        return dist < 0.001;
      });
      if (nearInlet && drainData && drainData.status === "red") {
        waterDepth += 8 + noise * 4;
      }
    }

    waterDepth = clamp(waterDepth, 0, 30);

    let status: "dry" | "damp" | "pooling" | "flooding" = "dry";
    if (waterDepth > 10) status = "flooding";
    else if (waterDepth > 5) status = "pooling";
    else if (waterDepth > 1.5) status = "damp";

    return {
      sensor_id: sensor.id,
      water_depth_cm: Math.round(waterDepth * 10) / 10,
      status,
      timestamp: new Date(Date.now() - (100 - tick) * TICK_INTERVAL_MS).toISOString(),
    };
  });
}

function generateInletReadings(
  tick: number,
  config: SilkboardSimConfig,
  drainTelemetry: SilkboardDrainTelemetry[],
): SilkboardInletReading[] {
  return DRAIN_INLETS.map((inlet, i) => {
    const parentDrain = PERIPHERAL_DRAINS.find((d) => d.id === inlet.drain_segment_id);
    const noise = seededNoise(tick * 300 + i * 17);

    // Find closest drain node to assess pressure
    let maxDrainLevel = 0;
    for (const dt of drainTelemetry) {
      const node = DRAIN_NODES.find((n) => n.drain_id === dt.drain_id);
      if (!node) continue;
      const dist = Math.sqrt(
        (node.position[0] - inlet.position[0]) ** 2 +
        (node.position[1] - inlet.position[1]) ** 2,
      );
      if (dist < 0.003 && dt.telemetry.water_level_cm > maxDrainLevel) {
        maxDrainLevel = dt.telemetry.water_level_cm;
      }
    }

    let flowDirection: "inward" | "stagnant" | "backflow" = "inward";
    let flowRate = 2 + config.rainfall_mm_hr * 0.1 + noise * 0.5;
    let status: "normal" | "surging" | "backflow" | "blocked" = "normal";

    if (config.scenario === "inlet_backflow" && maxDrainLevel > 100) {
      flowDirection = "backflow";
      flowRate = -(maxDrainLevel - 100) * 0.1 - noise * 0.5;
      status = "backflow";
    } else if (maxDrainLevel > 90) {
      flowDirection = "stagnant";
      flowRate = 0.1 + noise * 0.1;
      status = "surging";
    } else if (config.scenario === "blockage" && maxDrainLevel > 80) {
      flowDirection = "stagnant";
      flowRate = 0.2;
      status = "blocked";
    }

    if (config.scenario === "heavy_rain") {
      flowRate *= 2.5;
      if (flowRate > (parentDrain?.capacity_liters_per_sec ?? 150) * 0.01) {
        status = "surging";
      }
    }

    return {
      inlet_id: inlet.id,
      flow_direction: flowDirection,
      flow_rate_lps: Math.round(Math.abs(flowRate) * 100) / 100,
      status,
    };
  });
}

function generateCameraStates(
  tick: number,
  config: SilkboardSimConfig,
  drainTelemetry: SilkboardDrainTelemetry[],
  roadSensors: SilkboardRoadSensorReading[],
  activeFailures?: Set<FailureType>,
): SilkboardCameraState[] {
  return CAMERAS.map((camera) => {
    // Injected Fault: Kill Camera CAM-02
    if (activeFailures?.has("camera_offline") && camera.id === "CAM-02") {
      return {
        camera_id: camera.id,
        status: "offline" as const,
        last_detection: null,
        detection_active: false,
        waterlogging_confidence: 0,
      };
    }

    // Check if any sensors in camera's coverage area are alerting
    const nearbySensors = ROAD_SENSORS.filter((s) => {
      const dist = Math.sqrt(
        (s.position[0] - camera.position[0]) ** 2 +
        (s.position[1] - camera.position[1]) ** 2,
      );
      return dist < camera.coverage_radius / 100000;
    });

    const nearbyReadings = nearbySensors
      .map((s) => roadSensors.find((r) => r.sensor_id === s.id))
      .filter(Boolean) as SilkboardRoadSensorReading[];

    const floodingSensors = nearbyReadings.filter((r) => r.status === "flooding" || r.status === "pooling");
    const detectionActive = floodingSensors.length >= 2;
    const waterloggingConfidence = detectionActive
      ? clamp(50 + floodingSensors.length * 15 + seededNoise(tick * 500 + parseInt(camera.id.replace(/\D/g, ""), 10)) * 10, 0, 99)
      : 0;

    return {
      camera_id: camera.id,
      status: detectionActive ? "alert" as const : "online" as const,
      last_detection: detectionActive ? new Date().toISOString() : null,
      detection_active: detectionActive,
      waterlogging_confidence: Math.round(waterloggingConfidence),
    };
  });
}

function computeMetrics(
  drains: SilkboardDrainTelemetry[],
  roadSensors: SilkboardRoadSensorReading[],
  cameras: SilkboardCameraState[],
  traces: ExecutionTrace[] = [],
): SilkboardMetrics {
  const alerts = drains.filter((d) => d.status !== "green").length +
    roadSensors.filter((s) => s.status === "flooding" || s.status === "pooling").length;

  const avgWater = drains.reduce((s, d) => s + d.telemetry.water_level_cm, 0) / drains.length;
  const avgUtil = drains.reduce((s, d) => {
    const node = DRAIN_NODES.find((n) => n.drain_id === d.drain_id);
    return s + (d.telemetry.water_level_cm / (node?.capacity_liters_per_sec ?? 400 * 0.3));
  }, 0) / drains.length;

  let risk: SilkboardRiskLevel = "green";
  if (drains.some((d) => d.status === "red") || alerts > 5) risk = "red";
  else if (drains.some((d) => d.status === "yellow") || alerts > 2) risk = "yellow";

  const totalSelfHeals = traces.reduce((acc, t) => acc + (t.self_healing_count || 0), 0);
  const latestTrace = traces[0];
  const gatesPassed = latestTrace ? latestTrace.gates.filter((g) => g.status === "pass").length : 5;

  return {
    active_sensors: ROAD_SENSORS.length + DRAIN_NODES.length + DRAIN_INLETS.length,
    alerts,
    avg_water_level_cm: Math.round(avgWater * 10) / 10,
    avg_drain_utilization: Math.round(avgUtil * 100) / 100,
    cameras_online: cameras.filter((c) => c.status !== "offline").length,
    risk_level: risk,
    self_heals: totalSelfHeals,
    gates_passed: gatesPassed,
  };
}

// ─── Ring buffer for history ────────────────────────────────────────────────

const HISTORY_SIZE = 60;

interface DrainHistory {
  water_levels: number[];
  flow_velocities: number[];
  turbidities: number[];
}

// ─── Main hook ──────────────────────────────────────────────────────────────

export function useSilkboardSimulation() {
  const [config, setConfig] = useState<SilkboardSimConfig>(DEFAULT_CONFIG);
  const [snapshot, setSnapshot] = useState<SilkboardSnapshot | null>(null);
  const [drainHistory, setDrainHistory] = useState<Record<string, DrainHistory>>({});
  const tickRef = useRef(0);
  const detectionsRef = useRef<AgentDetection[]>([]);

  // A1: Active failure injection and trace buffers
  const [activeFailures, setActiveFailures] = useState<Set<FailureType>>(new Set());
  const activeFailuresRef = useRef<Set<FailureType>>(activeFailures);
  activeFailuresRef.current = activeFailures;

  const [traces, setTraces] = useState<ExecutionTrace[]>([]);
  const tracesRef = useRef<ExecutionTrace[]>(traces);
  tracesRef.current = traces;

  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

  // Tick-based simulation loop
  useEffect(() => {
    if (!config.running) return;

    const interval = setInterval(() => {
      tickRef.current += 1;
      const tick = tickRef.current;
      const elapsed = tick * (TICK_INTERVAL_MS / 1000) * config.speed;

      const currentConfig = { ...config, elapsed_seconds: elapsed };
      const drains = generateDrainTelemetry(tick, currentConfig, activeFailuresRef.current);
      const roadSensors = generateRoadSensorReadings(tick, currentConfig, drains);
      const inlets = generateInletReadings(tick, currentConfig, drains);
      const cameras = generateCameraStates(tick, currentConfig, drains, roadSensors, activeFailuresRef.current);
      const metrics = computeMetrics(drains, roadSensors, cameras, tracesRef.current);

      // Update history ring buffers
      setDrainHistory((prev) => {
        const next = { ...prev };
        for (const d of drains) {
          const existing = next[d.drain_id] ?? { water_levels: [], flow_velocities: [], turbidities: [] };
          next[d.drain_id] = {
            water_levels: [...existing.water_levels, d.telemetry.water_level_cm].slice(-HISTORY_SIZE),
            flow_velocities: [...existing.flow_velocities, d.telemetry.flow_velocity_mps].slice(-HISTORY_SIZE),
            turbidities: [...existing.turbidities, d.telemetry.turbidity_ntu].slice(-HISTORY_SIZE),
          };
        }
        return next;
      });

      setSnapshot({
        tick,
        timestamp: new Date().toISOString(),
        drains,
        road_sensors: roadSensors,
        inlets,
        cameras,
        detections: detectionsRef.current,
        traces: tracesRef.current,
        activeFailures: Array.from(activeFailuresRef.current),
        metrics,
        config: currentConfig,
      });

      setConfig((c) => ({ ...c, elapsed_seconds: elapsed }));
    }, TICK_INTERVAL_MS / config.speed);

    return () => clearInterval(interval);
  }, [config]);

  const startScenario = useCallback((scenario: SilkboardScenarioKind, blockedId?: string | null) => {
    tickRef.current = 0;
    detectionsRef.current = [];
    setActiveFailures(new Set());
    const rainfallMap: Record<SilkboardScenarioKind, number> = {
      normal: 8,
      heavy_rain: 65,
      blockage: 25,
      inlet_backflow: 45,
    };
    setConfig((c) => ({
      ...c,
      scenario,
      rainfall_mm_hr: rainfallMap[scenario],
      blocked_drain_id: scenario === "blockage" ? (blockedId ?? "BLR-SKB-103") : null,
      elapsed_seconds: 0,
      running: true,
    }));
    setDrainHistory({});
  }, []);

  const setRainfall = useCallback((mm: number) => {
    setConfig((c) => ({ ...c, rainfall_mm_hr: clamp(mm, 0, 100) }));
  }, []);

  const setRunning = useCallback((running: boolean) => {
    setConfig((c) => ({ ...c, running }));
  }, []);

  const setSpeed = useCallback((speed: 1 | 2 | 4) => {
    setConfig((c) => ({ ...c, speed }));
  }, []);

  const addDetection = useCallback((detection: AgentDetection) => {
    detectionsRef.current = [detection, ...detectionsRef.current].slice(0, 20);
    setSnapshot((prev) => prev ? { ...prev, detections: detectionsRef.current } : prev);
  }, []);

  const addTrace = useCallback((trace: ExecutionTrace) => {
    setTraces((prev) => {
      const next = [trace, ...prev.filter((t) => t.trace_id !== trace.trace_id)].slice(0, 10);
      tracesRef.current = next;
      return next;
    });
    setActiveTraceId(trace.trace_id);
    setSnapshot((prev) => prev ? { ...prev, traces: tracesRef.current } : prev);
  }, []);

  const injectFailure = useCallback((failure: FailureType) => {
    setActiveFailures((prev) => new Set([...prev, failure]));
  }, []);

  const clearFailure = useCallback((failure: FailureType) => {
    setActiveFailures((prev) => {
      const next = new Set(prev);
      next.delete(failure);
      return next;
    });
  }, []);

  const toggleFailure = useCallback((failure: FailureType) => {
    setActiveFailures((prev) => {
      const next = new Set(prev);
      if (next.has(failure)) next.delete(failure);
      else next.add(failure);
      return next;
    });
  }, []);

  const clearAllFailures = useCallback(() => {
    setActiveFailures(new Set());
  }, []);

  return {
    config,
    snapshot,
    drainHistory,
    startScenario,
    setRainfall,
    setRunning,
    setSpeed,
    addDetection,
    activeFailures,
    injectFailure,
    clearFailure,
    toggleFailure,
    clearAllFailures,
    traces,
    activeTraceId,
    setActiveTraceId,
    addTrace,
  };
}
