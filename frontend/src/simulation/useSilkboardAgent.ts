import { useCallback, useEffect, useRef } from "react";
import {
  CAMERAS,
  DRAIN_INLETS,
  DRAIN_NODES,
  ROAD_SENSORS,
  SCENARIO_REFERENCES,
  getNearestCamera,
} from "../data/silkboard";
import {
  isGeminiActive,
  callGeminiCausalDisambiguation,
} from "../services/geminiService";
import type {
  AgentDetection,
  AnomalyClassification,
  CausalJudgment,
  DebrisClass,
  ExecutionTrace,
  FailureType,
  SilkboardDrainTelemetry,
  SilkboardInletReading,
  SilkboardRiskLevel,
  SilkboardRoadSensorReading,
  SilkboardSnapshot,
  TemporalChunkRecording,
  VisualTriageResult,
} from "../types";
import { executeEvidenceGatedPipeline } from "./evidenceGates";

// ─── Configurable thresholds ────────────────────────────────────────────────

const BLOCKAGE_WATER_LEVEL_THRESHOLD = 75;
const BLOCKAGE_FLOW_VELOCITY_THRESHOLD = 0.3;
const BACKFLOW_TRIGGER_LEVEL = 95;
const MULTI_SENSOR_CORRELATION_COUNT = 3;
const VISUAL_TRIAGE_PROBABILITY_THRESHOLD = 70;
const AGENT_CYCLE_INTERVAL_MS = 15000; // Strict 15-second agent pipeline execution cycle

/**
 * Builds a rich 15-second continuous temporal recording chunk from the simulation history.
 * Computes exact physical derivatives (rate of rise dh/dt, flow deceleration dv/dt) and
 * correlates surface street inlets, road ponding depth, and hydraulic head gradients across the 15s window.
 */
function buildTemporalChunk(
  history: { water_levels: number[]; flow_velocities: number[]; turbidities: number[] } | undefined,
  currentDrain: SilkboardDrainTelemetry,
  neighbors: SilkboardDrainTelemetry[],
  snapshot: SilkboardSnapshot,
): TemporalChunkRecording {
  const durationSeconds = 15;
  const levels = history?.water_levels && history.water_levels.length > 0
    ? [...history.water_levels.slice(-8), currentDrain.telemetry.water_level_cm]
    : [currentDrain.telemetry.water_level_cm];
  const flows = history?.flow_velocities && history.flow_velocities.length > 0
    ? [...history.flow_velocities.slice(-8), currentDrain.telemetry.flow_velocity_mps]
    : [currentDrain.telemetry.flow_velocity_mps];
  const turbidities = history?.turbidities && history.turbidities.length > 0
    ? [...history.turbidities.slice(-8), currentDrain.telemetry.turbidity_ntu]
    : [currentDrain.telemetry.turbidity_ntu];

  const startLevel = levels[0] ?? currentDrain.telemetry.water_level_cm;
  const endLevel = levels[levels.length - 1] ?? currentDrain.telemetry.water_level_cm;
  const startVelocity = flows[0] ?? currentDrain.telemetry.flow_velocity_mps;
  const endVelocity = flows[flows.length - 1] ?? currentDrain.telemetry.flow_velocity_mps;

  const rateOfRise = (endLevel - startLevel) / durationSeconds;
  const flowDecel = (startVelocity - endVelocity) / durationSeconds;
  const startTurbidity = turbidities[0] ?? currentDrain.telemetry.turbidity_ntu;
  const endTurbidity = turbidities[turbidities.length - 1] ?? currentDrain.telemetry.turbidity_ntu;
  const turbRate = (endTurbidity - startTurbidity) / durationSeconds;

  const rainfallMmHr = currentDrain.weather.precip_rate_mm_hr;
  // Theoretical max rise from pure rain runoff (1mm/hr ~= 0.025 cm/s theoretical limit for catchment)
  const expectedRainRiseRate = Math.max(0.02, (rainfallMmHr * 1.5) / 60);
  const hydraulicAnomalyRatio = rateOfRise > 0
    ? Math.max(1, Math.round((rateOfRise / expectedRainRiseRate) * 10) / 10)
    : 1;

  // Upstream / downstream head loss: BLR-SKB-103 to 104
  let upstreamDownstreamGradientCm: number | undefined;
  const downstream = neighbors.find((n) => n.drain_id === "BLR-SKB-104");
  if (currentDrain.drain_id === "BLR-SKB-103" && downstream) {
    upstreamDownstreamGradientCm = Math.max(0, currentDrain.telemetry.water_level_cm - downstream.telemetry.water_level_cm);
  }

  // Correlate nearby surface inlets in this 15s instance
  const nearbyInlets = snapshot.inlets.filter((i) => {
    const inletNode = DRAIN_INLETS.find((di) => di.id === i.inlet_id);
    const drainNode = DRAIN_NODES.find((n) => n.drain_id === currentDrain.drain_id);
    if (!inletNode || !drainNode) return false;
    const dist = Math.sqrt(
      (inletNode.position[0] - drainNode.position[0]) ** 2 +
      (inletNode.position[1] - drainNode.position[1]) ** 2,
    );
    return dist < 0.003;
  });
  const backflowInlet = nearbyInlets.find((i) => i.flow_direction === "backflow");
  const inletBackflowActive = Boolean(backflowInlet);
  const inletBackflowRateLps = backflowInlet?.flow_rate_lps ?? 0;

  // Correlate nearby road ponding sensors in this 15s instance
  const nearbyRoadSensors = snapshot.road_sensors.filter((r) => {
    const s = ROAD_SENSORS.find((rs) => rs.id === r.sensor_id);
    return s?.drain_node_id === currentDrain.drain_id;
  });
  const pondingSensors = nearbyRoadSensors.filter((s) => s.status === "pooling" || s.status === "flooding");
  const maxSurfaceDepthCm = nearbyRoadSensors.length > 0
    ? Math.max(0, ...nearbyRoadSensors.map((r) => r.water_depth_cm))
    : 0;

  const hydraulicChokeSignature = rateOfRise > 0.15 && flowDecel >= -0.005;

  return {
    durationSeconds,
    sampleCount: levels.length,
    waterLevels: levels.map((v) => Math.round(v * 10) / 10),
    flowVelocities: flows.map((v) => Math.round(v * 100) / 100),
    turbidities: turbidities.map((v) => Math.round(v)),
    rateOfRiseCmPerSec: Math.round(rateOfRise * 100) / 100,
    flowDecelerationRate: Math.round(flowDecel * 1000) / 1000,
    turbidityRateOfChange: Math.round(turbRate * 10) / 10,
    startLevel,
    endLevel,
    startVelocity,
    endVelocity,
    rainfallMmHr,
    expectedRainRiseRate: Math.round(expectedRainRiseRate * 100) / 100,
    hydraulicAnomalyRatio,
    upstreamDownstreamGradientCm: upstreamDownstreamGradientCm !== undefined ? Math.round(upstreamDownstreamGradientCm * 10) / 10 : undefined,
    inletBackflowActive,
    inletBackflowRateLps: Math.round(inletBackflowRateLps * 10) / 10,
    nearbyPondingSensorsCount: pondingSensors.length,
    maxSurfaceDepthCm: Math.round(maxSurfaceDepthCm * 10) / 10,
    hydraulicChokeSignature,
  };
}

// ─── Deterministic causal disambiguation (heuristic fallback) ─────────────
// This implements the 4-signal weighted read from the architecture doc §2.

function causalDisambiguation(
  drain: SilkboardDrainTelemetry,
  neighbors: SilkboardDrainTelemetry[],
  historyWaterLevels: number[],
): CausalJudgment {
  const { water_level_cm, flow_velocity_mps, turbidity_ntu } = drain.telemetry;
  const { precip_rate_mm_hr, upstream_precip_mm_hr } = drain.weather;

  // Signal 1: Flow velocity vs baseline
  const flowDropped = flow_velocity_mps < BLOCKAGE_FLOW_VELOCITY_THRESHOLD;
  const flowScore = flowDropped ? 0.3 : 0;

  // Signal 2: Water level trend (rising?)
  let trendScore = 0;
  if (historyWaterLevels.length >= 3) {
    const recent = historyWaterLevels.slice(-5);
    const rising = recent.every((v, i) => i === 0 || v >= recent[i - 1] - 2);
    const riseRate = (recent[recent.length - 1] - recent[0]) / recent.length;
    if (rising && riseRate > 2) trendScore = 0.25;
  }

  // Signal 3: Upstream rainfall — does rain explain the water level?
  const expectedLevel = precip_rate_mm_hr * 1.5; // simplified rain-to-level model
  const rainExplainsLevel = water_level_cm < expectedLevel * 1.3;
  const rainScore = rainExplainsLevel ? 0 : 0.25;

  // Signal 4: Neighbor isolation — if neighbors are normal, this is suspicious
  const neighborsElevated = neighbors.filter(
    (n) => n.telemetry.water_level_cm > BLOCKAGE_WATER_LEVEL_THRESHOLD,
  ).length;
  const isolated = neighborsElevated < neighbors.length * 0.3;
  const isolationScore = isolated ? 0.2 : 0;

  const totalScore = flowScore + trendScore + rainScore + isolationScore;
  const probability = Math.min(99, Math.round(totalScore * 100));

  // Build reasoning chain
  const reasons: string[] = [];
  if (flowDropped) {
    reasons.push(
      `Flow velocity at ${flow_velocity_mps.toFixed(2)} m/s is ${Math.round((1 - flow_velocity_mps / 1.5) * 100)}% below normal baseline — consistent with physical obstruction.`,
    );
  }
  if (trendScore > 0) {
    reasons.push(
      `Water level trending upward at ${water_level_cm.toFixed(0)} cm, rising consistently over the last ${historyWaterLevels.length} readings.`,
    );
  }
  if (rainScore > 0) {
    reasons.push(
      `Current rainfall of ${precip_rate_mm_hr.toFixed(1)} mm/hr explains only ~${Math.round(expectedLevel)} cm of water level, but observed level is ${water_level_cm.toFixed(0)} cm — ${Math.round(((water_level_cm - expectedLevel) / expectedLevel) * 100)}% above rain-driven expectation.`,
    );
  }
  if (isolationScore > 0) {
    reasons.push(
      `Anomaly is isolated: only ${neighborsElevated} of ${neighbors.length} neighboring drains show elevated levels, suggesting localized cause rather than systemic rainfall.`,
    );
  }

  let classification: AnomalyClassification = "normal_runoff";
  if (probability >= 80) classification = "confirmed_blockage";
  else if (probability >= VISUAL_TRIAGE_PROBABILITY_THRESHOLD) classification = "probable_blockage";

  const reasoning =
    classification === "normal_runoff"
      ? `Water level of ${water_level_cm.toFixed(0)} cm is consistent with ${precip_rate_mm_hr.toFixed(1)} mm/hr rainfall. Flow velocity and neighbor patterns are within expected range. No blockage indicators.`
      : reasons.join(" ");

  return {
    drain_id: drain.drain_id,
    classification,
    blockage_probability: probability,
    reasoning,
    trigger_visual_triage: probability >= VISUAL_TRIAGE_PROBABILITY_THRESHOLD,
    engine_source: "heuristic",
  };
}

// ─── Visual triage simulation (mock YOLO + Gemini Vision) ──────────────────

function simulateVisualTriage(
  cameraId: string,
  drainId: string,
  tick: number,
): VisualTriageResult | null {
  // Simulate YOLO pre-filter: "is there something in frame?"
  const seed = tick * 7 + parseInt(cameraId.replace(/\D/g, ""), 10) * 13;
  const noise = Math.sin(seed * 12.9898) * 43758.5453;
  const detectionProbability = 0.6 + (noise - Math.floor(noise)) * 0.35;

  if (detectionProbability < 0.55) return null; // YOLO says nothing in frame

  // Gemini Vision classification into 3 dispatch classes
  const classes: DebrisClass[] = ["plastic", "silt", "construction_debris"];
  const classIndex = Math.floor((noise - Math.floor(noise)) * 3) % 3;

  return {
    camera_id: cameraId,
    debris_class: classes[classIndex],
    confidence: Math.round(70 + (noise - Math.floor(noise)) * 25),
    frame_index: tick % 6, // cycles through 6 reference frames (0-5)
  };
}

// ─── Scenario matching ─────────────────────────────────────────────────────

function matchScenario(
  judgment: CausalJudgment,
  drain: SilkboardDrainTelemetry,
  inlets: SilkboardInletReading[],
  roadSensors: SilkboardRoadSensorReading[],
): { matched: string | null; isNovel: boolean } {
  // Check against predefined scenarios
  if (judgment.classification !== "normal_runoff") {
    // SCN-05: Rain vs Blockage
    if (judgment.blockage_probability >= 70) {
      return { matched: "SCN-05", isNovel: false };
    }
  }

  // SCN-02: Inlet Backflow
  const backflowInlets = inlets.filter((i) => i.flow_direction === "backflow");
  if (backflowInlets.length > 0) {
    return { matched: "SCN-02", isNovel: false };
  }

  // SCN-01: Drain Capacity Breach
  if (drain.telemetry.water_level_cm > 90) {
    return { matched: "SCN-01", isNovel: false };
  }

  // SCN-04: Multi-sensor correlation
  const floodingSensors = roadSensors.filter(
    (s) => s.status === "flooding" || s.status === "pooling",
  );
  if (floodingSensors.length >= MULTI_SENSOR_CORRELATION_COUNT) {
    return { matched: "SCN-04", isNovel: false };
  }

  // Novel detection: agent found something not in the reference set
  if (judgment.blockage_probability > 40 && drain.telemetry.turbidity_ntu > 500) {
    return {
      matched: null,
      isNovel: true,
    };
  }

  return { matched: null, isNovel: false };
}

// ─── Dispatch action generator ─────────────────────────────────────────────

function generateDispatchAction(
  classification: AnomalyClassification,
  visual: VisualTriageResult | null,
): string | null {
  if (classification === "normal_runoff") return null;

  if (visual) {
    const crewType: Record<DebrisClass, string> = {
      plastic: "Light cleanup crew — plastic debris removal",
      silt: "Desilting crew — sediment clearance required",
      construction_debris: "Heavy desilting crew — construction material extraction",
    };
    return crewType[visual.debris_class];
  }

  if (classification === "confirmed_blockage") {
    return "Emergency inspection crew — confirmed obstruction, camera verification pending";
  }

  return "Monitoring crew — elevated blockage probability, visual confirmation required";
}

// ─── Build evidence list ────────────────────────────────────────────────────

function buildEvidence(
  drain: SilkboardDrainTelemetry,
  roadSensors: SilkboardRoadSensorReading[],
  inlets: SilkboardInletReading[],
): Array<{ sensor_id: string; label: string; value: string }> {
  const evidence: Array<{ sensor_id: string; label: string; value: string }> = [];

  evidence.push({
    sensor_id: drain.drain_id,
    label: "Water level",
    value: `${drain.telemetry.water_level_cm.toFixed(0)} cm`,
  });
  evidence.push({
    sensor_id: drain.drain_id,
    label: "Flow velocity",
    value: `${drain.telemetry.flow_velocity_mps.toFixed(2)} m/s`,
  });
  evidence.push({
    sensor_id: drain.drain_id,
    label: "Turbidity",
    value: `${drain.telemetry.turbidity_ntu} NTU`,
  });
  evidence.push({
    sensor_id: drain.drain_id,
    label: "Rainfall",
    value: `${drain.weather.precip_rate_mm_hr.toFixed(1)} mm/hr`,
  });

  // Add nearby flooding road sensors
  const drainNode = DRAIN_NODES.find((n) => n.drain_id === drain.drain_id);
  if (drainNode) {
    const nearbySensors = ROAD_SENSORS.filter((s) => s.drain_node_id === drain.drain_id);
    for (const sensor of nearbySensors) {
      const reading = roadSensors.find((r) => r.sensor_id === sensor.id);
      if (reading && (reading.status === "pooling" || reading.status === "flooding")) {
        evidence.push({
          sensor_id: reading.sensor_id,
          label: `Road sensor ${sensor.id}`,
          value: `${reading.water_depth_cm.toFixed(1)} cm (${reading.status})`,
        });
      }
    }
  }

  // Add backflowing inlets
  const backflowInlets = inlets.filter((i) => i.flow_direction === "backflow");
  for (const inlet of backflowInlets.slice(0, 2)) {
    evidence.push({
      sensor_id: inlet.inlet_id,
      label: `Inlet ${inlet.inlet_id}`,
      value: `BACKFLOW at ${inlet.flow_rate_lps.toFixed(1)} L/s`,
    });
  }

  return evidence;
}

// ─── Main Agent Hook ────────────────────────────────────────────────────────

export function useSilkboardAgent(
  snapshot: SilkboardSnapshot | null,
  drainHistory: Record<string, { water_levels: number[]; flow_velocities: number[]; turbidities: number[] }>,
  addDetection: (detection: AgentDetection) => void,
  addTrace?: (trace: ExecutionTrace) => void,
  activeFailures?: Set<FailureType>,
) {
  const lastCycleTimeRef = useRef<number>(0);
  const isEvaluatingRef = useRef<boolean>(false);
  const prevScenarioRef = useRef<string | null>(null);
  const prevFailuresSizeRef = useRef<number>(0);
  const detectionCounter = useRef(0);

  const processAndEmitPipelineResult = useCallback(
    (
      trace: ExecutionTrace,
      verifiedClassification: AnomalyClassification,
      visual: VisualTriageResult | null,
      drain: SilkboardDrainTelemetry,
      tick: number,
      currentSnapshot: SilkboardSnapshot,
    ) => {
      // Step 3: Risk classification
      let riskLevel: SilkboardRiskLevel = "green";
      const g2Confidence = trace.gates[1]?.confidence ?? 0;
      if (verifiedClassification === "confirmed_blockage" || g2Confidence >= 80) {
        riskLevel = "red";
      } else if (verifiedClassification === "probable_blockage" || g2Confidence >= 50) {
        riskLevel = "yellow";
      }

      // Step 4: Scenario matching
      const nearbyInlets = currentSnapshot.inlets.filter((i) => {
        const inlet = DRAIN_INLETS.find((di) => di.id === i.inlet_id);
        if (!inlet) return false;
        const node = DRAIN_NODES.find((n) => n.drain_id === drain.drain_id);
        if (!node) return false;
        const dist = Math.sqrt(
          (inlet.position[0] - node.position[0]) ** 2 +
          (inlet.position[1] - node.position[1]) ** 2,
        );
        return dist < 0.003;
      });

      const nearbyRoadSensors = currentSnapshot.road_sensors.filter((r) => {
        const sensor = ROAD_SENSORS.find((s) => s.id === r.sensor_id);
        return sensor?.drain_node_id === drain.drain_id;
      });

      const causalJudgment: CausalJudgment = {
        drain_id: drain.drain_id,
        classification: verifiedClassification,
        blockage_probability: g2Confidence,
        reasoning: trace.gates[1]?.evidence[0]?.claim || "Causal evidence evaluated.",
        trigger_visual_triage: Boolean(visual),
      };

      const { matched, isNovel } = matchScenario(
        causalJudgment,
        drain,
        nearbyInlets,
        nearbyRoadSensors,
      );

      // Build self-healing narrative for audit trail
      const selfHealingNotes = trace.gates
        .filter((g) => g.recovery?.executed)
        .map((g) => `[${g.gate_name} Self-Heal]: ${g.recovery?.outcome}`)
        .join(" | ");

      const primaryGateEvidence = trace.gates
        .flatMap((g) => g.evidence)
        .filter((e) => e.status === "pass")
        .slice(0, 3)
        .map((e) => e.claim)
        .join("; ");

      const reasoning = selfHealingNotes
        ? `${selfHealingNotes} — Multi-Gate Evidence: ${primaryGateEvidence}`
        : `Verified across 5 evidence gates: ${primaryGateEvidence}`;

      // Step 5: Build detection
      detectionCounter.current += 1;
      const detection: AgentDetection = {
        id: `DET-${String(detectionCounter.current).padStart(4, "0")}`,
        timestamp: new Date().toISOString(),
        drain_id: drain.drain_id,
        classification: verifiedClassification,
        blockage_probability: g2Confidence,
        reasoning,
        evidence: buildEvidence(drain, currentSnapshot.road_sensors, currentSnapshot.inlets),
        risk_level: riskLevel,
        visual_result: visual,
        dispatch_action: generateDispatchAction(verifiedClassification, visual),
        matched_scenario: matched,
        is_novel: isNovel,
        engine_source: trace.gates[1]?.recovery?.type === "fallback" ? "heuristic" : isGeminiActive() ? "gemini-live" : "heuristic",
      };

      addDetection(detection);
    },
    [addDetection],
  );

  useEffect(() => {
    if (!snapshot || !snapshot.config.running) return;

    const now = Date.now();
    const scenarioChanged = snapshot.config.scenario !== prevScenarioRef.current;
    const failuresChanged = (activeFailures?.size ?? 0) !== prevFailuresSizeRef.current;
    prevScenarioRef.current = snapshot.config.scenario;
    prevFailuresSizeRef.current = activeFailures?.size ?? 0;

    // Strictly enforce 15-second agent execution cycle (never polling rapidly every second)
    const minElapsed = AGENT_CYCLE_INTERVAL_MS;
    if (lastCycleTimeRef.current > 0 && now - lastCycleTimeRef.current < minElapsed) return;
    if (isEvaluatingRef.current) return;

    // Prioritize the candidate drain node for this 15-second evaluation cycle
    const targetBlockedDrain = snapshot.config.blocked_drain_id || "BLR-SKB-103";
    const hasActiveFault = Boolean(activeFailures && activeFailures.size > 0);

    let candidateDrain: SilkboardDrainTelemetry | null = null;

    if (hasActiveFault) {
      candidateDrain = snapshot.drains.find((d) => d.drain_id === targetBlockedDrain) ?? null;
    } else if (snapshot.config.scenario === "blockage") {
      candidateDrain = snapshot.drains.find((d) => d.drain_id === targetBlockedDrain) ?? null;
    }

    if (!candidateDrain) {
      const sorted = [...snapshot.drains].sort(
        (a, b) => b.telemetry.water_level_cm - a.telemetry.water_level_cm,
      );
      if (sorted[0] && (sorted[0].telemetry.water_level_cm >= 48 || sorted[0].status !== "green")) {
        candidateDrain = sorted[0];
      }
    }

    // Completely skip API calls if all nodes are nominal (< 48cm and green)
    if (!candidateDrain) return;

    const drain = candidateDrain;
    const neighbors = snapshot.drains.filter((d) => d.drain_id !== drain.drain_id);
    const history = drainHistory[drain.drain_id]?.water_levels ?? [];

    // Extract the rich 15-second continuous temporal chunk from history
    const temporalChunk = buildTemporalChunk(drainHistory[drain.drain_id], drain, neighbors, snapshot);

    lastCycleTimeRef.current = now;
    isEvaluatingRef.current = true;

    const canCallGemini = isGeminiActive();

    executeEvidenceGatedPipeline(
      {
        drain,
        neighbors,
        historyWaterLevels: history,
        snapshot,
        activeFailures,
        tick: snapshot.tick,
        callGemini: canCallGemini,
        temporalChunk,
      },
      (_gate, inProgressTrace) => {
        if (addTrace) {
          addTrace(inProgressTrace);
        }
      },
    )
      .then(({ trace, verifiedClassification, visual }) => {
        if (addTrace) {
          addTrace(trace);
        }

        // Emit detection if there's a problem or self-healing event
        if (
          verifiedClassification !== "normal_runoff" ||
          trace.gates[1]?.confidence >= 40 ||
          trace.self_healing_count > 0
        ) {
          processAndEmitPipelineResult(
            trace,
            verifiedClassification,
            visual,
            drain,
            snapshot.tick,
            snapshot,
          );
        }
      })
      .catch((err) => {
        console.warn("Evidence gate pipeline execution error:", err);
      })
      .finally(() => {
        isEvaluatingRef.current = false;
      });
  }, [snapshot?.tick, processAndEmitPipelineResult, addTrace, activeFailures, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps
}
