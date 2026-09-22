import type {
  AnomalyClassification,
  CausalJudgment,
  SilkboardDrainTelemetry,
  TemporalChunkRecording,
} from "../types";

export function isGeminiActive(): boolean {
  return true;
}

let lastGeminiApiCallTime = 0;
export const MIN_GEMINI_CALL_INTERVAL_MS = 15000;

export async function callGeminiCausalDisambiguation({
  drain,
  neighbors,
  historyWaterLevels,
  temporalChunk,
}: {
  drain: SilkboardDrainTelemetry;
  neighbors: SilkboardDrainTelemetry[];
  historyWaterLevels: number[];
  temporalChunk?: TemporalChunkRecording;
}): Promise<CausalJudgment | null> {
  const now = Date.now();
  if (lastGeminiApiCallTime > 0 && now - lastGeminiApiCallTime < MIN_GEMINI_CALL_INTERVAL_MS) {
    const waitSec = Math.ceil((MIN_GEMINI_CALL_INTERVAL_MS - (now - lastGeminiApiCallTime)) / 1000);
    console.info(`[UrbanFlow Quota Guard] Gemini call throttled (${waitSec}s remaining until 15s window). Returning null to allow heuristic fallback.`);
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), 12000);

  const neighborSummaries = neighbors.map((n) => ({
    drain_id: n.drain_id,
    water_level_cm: Math.round(n.telemetry.water_level_cm),
    flow_velocity_mps: Number(n.telemetry.flow_velocity_mps.toFixed(2)),
  }));

  const temporalSection = temporalChunk
    ? `
15-Second Continuous Recording Chunk (Dynamic Multi-Sensor Temporal Evaluation):
- Window Duration: ${temporalChunk.durationSeconds}s (${temporalChunk.sampleCount} continuous temporal telemetry frames)
- Sequential Water Level Progression: [${temporalChunk.waterLevels.join(" → ")}] cm
  * Net 15s Water Level Trend: ${temporalChunk.startLevel.toFixed(1)} cm → ${temporalChunk.endLevel.toFixed(1)} cm
  * Rate of Rise (dh/dt): ${temporalChunk.rateOfRiseCmPerSec >= 0 ? "+" : ""}${temporalChunk.rateOfRiseCmPerSec.toFixed(2)} cm/sec
- Sequential Flow Velocity Choke Progression: [${temporalChunk.flowVelocities.join(" → ")}] m/s
  * Hydraulic Deceleration Rate (dv/dt): ${temporalChunk.flowDecelerationRate >= 0 ? "+" : ""}${temporalChunk.flowDecelerationRate.toFixed(3)} m/s²
  * Hydraulic Choke Signature: ${temporalChunk.hydraulicChokeSignature ? "CONFIRMED (Rising Head + Flow Decay)" : "None"}
- Turbidity Trajectory: [${temporalChunk.turbidities.join(" → ")}] NTU (${temporalChunk.turbidityRateOfChange >= 0 ? "+" : ""}${temporalChunk.turbidityRateOfChange.toFixed(1)} NTU/s)
- Mass Balance & Rain Conservation:
  * Rainfall Rate: ${temporalChunk.rainfallMmHr.toFixed(1)} mm/hr (Theoretical Max Rise: ${temporalChunk.expectedRainRiseRate.toFixed(2)} cm/s)
  * Hydraulic Anomaly Ratio: ${temporalChunk.hydraulicAnomalyRatio.toFixed(1)}x expected rain accumulation
- Surface & Hydraulic Boundary Conditions in this 15s Instance:
  * Street Inlets: ${temporalChunk.inletBackflowActive ? `BACKFLOW ACTIVE (${temporalChunk.inletBackflowRateLps.toFixed(1)} L/s)` : "Normal Inflow"}
  * Road Ponding Sensors: ${temporalChunk.nearbyPondingSensorsCount} sensors pooling/flooding (Max surface depth: ${temporalChunk.maxSurfaceDepthCm.toFixed(1)} cm)
  * Upstream/Downstream Head Loss Differential: ${temporalChunk.upstreamDownstreamGradientCm !== undefined ? `${temporalChunk.upstreamDownstreamGradientCm.toFixed(1)} cm` : "N/A"}
`
    : `
Recent Water Level History: [${historyWaterLevels.slice(-6).map((v) => v.toFixed(0)).join(", ")}] cm
`;

  const prompt = `You are the UrbanFlow L3 AI Causal Disambiguation Engine for Bengaluru's Silk Board Junction stormwater network.
Analyze the following drain sensor telemetry chunk and classify whether the condition is normal rain runoff or a physical drain blockage.

Apply the 4-signal weighted decision logic using the 15-second dynamic recording chunk:
1. Hydraulic choking signature: evaluate dh/dt vs dv/dt over the 15s window. If water level is rising while velocity decelerates, a physical obstruction is present.
2. Hydraulic anomaly ratio: does current rainfall account for the rise rate, or is accumulation ${temporalChunk ? `${temporalChunk.hydraulicAnomalyRatio.toFixed(1)}x` : "significantly"} higher than rain dissipation capacity?
3. Surface boundary conditions: correlate inlet backflow and road ponding telemetry.
4. Neighbor spatial isolation: check if neighboring nodes exhibit normal outflow.

${temporalSection}
Current Telemetry:
- Drain ID: ${drain.drain_id}
- Water Level: ${drain.telemetry.water_level_cm.toFixed(1)} cm (Pipe capacity: 140cm)
- Flow Velocity: ${drain.telemetry.flow_velocity_mps.toFixed(2)} m/s (Normal baseline: 1.2 to 1.8 m/s)
- Turbidity: ${drain.telemetry.turbidity_ntu} NTU
- Local Rainfall: ${drain.weather.precip_rate_mm_hr.toFixed(1)} mm/hr
- Upstream Rainfall: ${drain.weather.upstream_precip_mm_hr.toFixed(1)} mm/hr
- Neighbor Drains Telemetry: ${JSON.stringify(neighborSummaries.slice(0, 4))}

Respond strictly with JSON according to this schema:
{
  "drain_id": "${drain.drain_id}",
  "classification": "normal_runoff" | "probable_blockage" | "confirmed_blockage",
  "blockage_probability": number between 0 and 100,
  "reasoning": "Clear, concise technical chain-of-thought explanation citing the 15-second rate of rise, velocity decay, and physical cause",
  "trigger_visual_triage": boolean (true if blockage_probability >= 70)
}`;

  const systemInstruction =
    "You are UrbanFlow L3 Stormwater Telemetry Classifier. Return ONLY a valid JSON object matching the requested schema. No markdown backticks or commentary outside JSON.";

  try {
    lastGeminiApiCallTime = Date.now();
    const response = await fetch("/.netlify/functions/silkboard-gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ prompt, systemInstruction }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("Gemini proxy error:", response.status, response.statusText);
      return null;
    }

    const data = await response.json().catch(() => null);
    const rawText = data?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    const validClassifications: AnomalyClassification[] = [
      "normal_runoff",
      "probable_blockage",
      "confirmed_blockage",
    ];
    const classification: AnomalyClassification = validClassifications.includes(
      parsed.classification,
    )
      ? parsed.classification
      : "probable_blockage";

    const parsedProbability = Number(parsed.blockage_probability);
    const blockageProbability = Number.isFinite(parsedProbability) ? parsedProbability : 50;

    return {
      drain_id: drain.drain_id,
      classification,
      blockage_probability: Math.min(100, Math.max(0, blockageProbability)),
      reasoning: String(parsed.reasoning || "Causal reasoning generated by Gemini Flash."),
      trigger_visual_triage: Boolean(parsed.trigger_visual_triage),
      engine_source: "gemini-live",
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("Failed to complete Gemini API call, falling back to heuristic engine:", err);
    return null;
  }
}
