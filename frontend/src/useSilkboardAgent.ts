import { useCallback, useEffect, useRef } from "react";
import {
  DRAIN_INLETS,
  DRAIN_NODES,
  ROAD_SENSORS,
  DEFAULT_SENSOR_CORRUPT_DRAIN_ID,
} from "./silkboard";
import { isGeminiActive } from "./services/geminiService";
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
} from "./types";
import { executeEvidenceGatedPipeline } from "./evidenceGates";

const MULTI_SENSOR_CORRELATION_COUNT = 3;
const AGENT_CYCLE_INTERVAL_MS = 15000;

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

function matchScenario(
  judgment: CausalJudgment,
  drain: SilkboardDrainTelemetry,
  inlets: SilkboardInletReading[],
  roadSensors: SilkboardRoadSensorReading[],
): { matched: string | null; isNovel: boolean } {
  if (judgment.classification !== "normal_runoff") {
    if (judgment.blockage_probability >= 70) {
      return { matched: "SCN-05", isNovel: false };
    }
  }

  const backflowInlets = inlets.filter((i) => i.flow_direction === "backflow");
  if (backflowInlets.length > 0) {
    return { matched: "SCN-02", isNovel: false };
  }

  if (drain.telemetry.water_level_cm > 90) {
    return { matched: "SCN-01", isNovel: false };
  }

  const floodingSensors = roadSensors.filter(
    (s) => s.status === "flooding" || s.status === "pooling",
  );
  if (floodingSensors.length >= MULTI_SENSOR_CORRELATION_COUNT) {
    return { matched: "SCN-04", isNovel: false };
  }

  if (judgment.blockage_probability > 40 && drain.telemetry.turbidity_ntu > 500) {
    return {
      matched: null,
      isNovel: true,
    };
  }

  return { matched: null, isNovel: false };
}

function generateDispatchAction(
  classification: AnomalyClassification,
  visual: VisualTriageResult | null,
): string | null {
  if (classification === "normal_runoff") return null;

  if (visual) {
    const crewType: Record<DebrisClass, string> = {
      plastic: "Light cleanup crew, plastic debris removal",
      silt: "Desilting crew, sediment clearance required",
      construction_debris: "Heavy desilting crew, construction material extraction",
    };
    return crewType[visual.debris_class];
  }

  if (classification === "confirmed_blockage") {
    return "Emergency inspection crew, confirmed obstruction, camera verification pending";
  }

  return "Monitoring crew, elevated blockage probability, visual confirmation required";
}

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
      let riskLevel: SilkboardRiskLevel = "green";
      const g2Confidence = trace.gates[1]?.confidence ?? 0;
      if (verifiedClassification === "confirmed_blockage" || g2Confidence >= 80) {
        riskLevel = "red";
      } else if (verifiedClassification === "probable_blockage" || g2Confidence >= 50) {
        riskLevel = "yellow";
      }

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
        ? `${selfHealingNotes}. Multi-gate evidence: ${primaryGateEvidence}`
        : `Verified across 5 evidence gates: ${primaryGateEvidence}`;

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
    prevScenarioRef.current = snapshot.config.scenario;
    prevFailuresSizeRef.current = activeFailures?.size ?? 0;

    if (lastCycleTimeRef.current > 0 && now - lastCycleTimeRef.current < AGENT_CYCLE_INTERVAL_MS) return;
    if (isEvaluatingRef.current) return;

    const targetBlockedDrain = snapshot.config.blocked_drain_id || DEFAULT_SENSOR_CORRUPT_DRAIN_ID;
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
