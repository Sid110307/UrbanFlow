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
  SilkboardDrainTelemetry,
  SilkboardInletReading,
  SilkboardRiskLevel,
  SilkboardRoadSensorReading,
  SilkboardSnapshot,
  VisualTriageResult,
} from "../types";

// ─── Configurable thresholds ────────────────────────────────────────────────

const BLOCKAGE_WATER_LEVEL_THRESHOLD = 75;
const BLOCKAGE_FLOW_VELOCITY_THRESHOLD = 0.3;
const BACKFLOW_TRIGGER_LEVEL = 95;
const MULTI_SENSOR_CORRELATION_COUNT = 3;
const VISUAL_TRIAGE_PROBABILITY_THRESHOLD = 70;
const AGENT_COOLDOWN_TICKS = 8; // Don't re-evaluate same drain within 8 ticks

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
  judgment: CausalJudgment,
  visual: VisualTriageResult | null,
): string | null {
  if (judgment.classification === "normal_runoff") return null;

  if (visual) {
    const crewType: Record<DebrisClass, string> = {
      plastic: "Light cleanup crew — plastic debris removal",
      silt: "Desilting crew — sediment clearance required",
      construction_debris: "Heavy desilting crew — construction material extraction",
    };
    return crewType[visual.debris_class];
  }

  if (judgment.classification === "confirmed_blockage") {
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
) {
  const cooldowns = useRef<Record<string, number>>({});
  const detectionCounter = useRef(0);
  const inFlightGemini = useRef(false);

  const processAndEmitDetection = useCallback(
    (
      judgment: CausalJudgment,
      drain: SilkboardDrainTelemetry,
      tick: number,
      currentSnapshot: SilkboardSnapshot,
    ) => {
      // Only generate detection if there's something worth reporting
      if (judgment.classification === "normal_runoff" && judgment.blockage_probability < 30) {
        return;
      }

      // Step 2: Visual triage (if blockage probability high enough)
      let visualResult: VisualTriageResult | null = null;
      if (judgment.trigger_visual_triage) {
        const drainNode = DRAIN_NODES.find((n) => n.drain_id === drain.drain_id);
        if (drainNode) {
          const nearestCam = getNearestCamera(drainNode.position);
          visualResult = simulateVisualTriage(nearestCam.id, drain.drain_id, tick);
        }
      }

      // Step 3: Risk classification
      let riskLevel: SilkboardRiskLevel = "green";
      if (judgment.classification === "confirmed_blockage" || judgment.blockage_probability >= 80) {
        riskLevel = "red";
      } else if (judgment.classification === "probable_blockage" || judgment.blockage_probability >= 50) {
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

      const { matched, isNovel } = matchScenario(
        judgment,
        drain,
        nearbyInlets,
        nearbyRoadSensors,
      );

      // Step 5: Build detection
      detectionCounter.current += 1;
      const detection: AgentDetection = {
        id: `DET-${String(detectionCounter.current).padStart(4, "0")}`,
        timestamp: new Date().toISOString(),
        drain_id: drain.drain_id,
        classification: judgment.classification,
        blockage_probability: judgment.blockage_probability,
        reasoning: judgment.reasoning,
        evidence: buildEvidence(drain, currentSnapshot.road_sensors, currentSnapshot.inlets),
        risk_level: riskLevel,
        visual_result: visualResult,
        dispatch_action: generateDispatchAction(judgment, visualResult),
        matched_scenario: matched,
        is_novel: isNovel,
        engine_source: judgment.engine_source ?? "heuristic",
      };

      addDetection(detection);
    },
    [addDetection],
  );

  useEffect(() => {
    if (!snapshot || !snapshot.config.running) return;

    const tick = snapshot.tick;

    // Evaluate each drain node
    for (const drain of snapshot.drains) {
      // Skip if on cooldown
      const lastEval = cooldowns.current[drain.drain_id] ?? 0;
      if (tick - lastEval < AGENT_COOLDOWN_TICKS) continue;

      // Only evaluate if drain is showing anomalous behavior
      if (drain.status === "green" && drain.telemetry.water_level_cm < 50) continue;

      // Get neighbors for the 4-signal read
      const neighbors = snapshot.drains.filter((d) => d.drain_id !== drain.drain_id);
      const history = drainHistory[drain.drain_id]?.water_levels ?? [];

      cooldowns.current[drain.drain_id] = tick;

      // If Gemini Live is active and not currently processing another query, call live API
      if (isGeminiActive() && !inFlightGemini.current) {
        inFlightGemini.current = true;
        callGeminiCausalDisambiguation({ drain, neighbors, historyWaterLevels: history })
          .then((geminiJudgment) => {
            const judgment =
              geminiJudgment || causalDisambiguation(drain, neighbors, history);
            processAndEmitDetection(judgment, drain, tick, snapshot);
          })
          .catch(() => {
            const judgment = causalDisambiguation(drain, neighbors, history);
            processAndEmitDetection(judgment, drain, tick, snapshot);
          })
          .finally(() => {
            inFlightGemini.current = false;
          });
      } else {
        // Fallback to fast deterministic heuristic model
        const judgment = causalDisambiguation(drain, neighbors, history);
        processAndEmitDetection(judgment, drain, tick, snapshot);
      }
    }
  }, [snapshot?.tick, processAndEmitDetection]); // eslint-disable-line react-hooks/exhaustive-deps
}
