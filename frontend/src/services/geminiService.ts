import type {
  AnomalyClassification,
  CausalJudgment,
  SilkboardDrainTelemetry,
  TemporalChunkRecording,
} from "../types";

const STORAGE_KEY_API_KEY = "urbanflow_gemini_api_key";
const STORAGE_KEY_MODEL = "urbanflow_gemini_model";
const DEFAULT_MODEL = "gemini-flash-latest";

export function getGeminiApiKey(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY_API_KEY);
  if (stored && stored.trim()) return stored.trim();
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (envKey && String(envKey).trim()) return String(envKey).trim();
  return null;
}

export function setGeminiApiKey(key: string) {
  if (typeof window === "undefined") return;
  if (!key || !key.trim()) {
    localStorage.removeItem(STORAGE_KEY_API_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY_API_KEY, key.trim());
  }
}

export function getGeminiModel(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL;
}

export function setGeminiModel(model: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_MODEL, model);
}

export function isGeminiActive(): boolean {
  return Boolean(getGeminiApiKey());
}

export interface GeminiModelInfo {
  id: string;
  displayName: string;
  description?: string;
  supportedMethods: string[];
}

export const POPULAR_GEMINI_MODELS = [
  { id: "gemini-flash-latest", label: "Gemini Flash Latest (Active / Recommended)" },
  { id: "gemini-pro-latest", label: "Gemini Pro Latest (Deep Reasoning)" },
  { id: "gemini-flash-lite-latest", label: "Gemini Flash Lite Latest (Fastest)" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash Latest" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

/**
 * Filter out non-general text reasoning models (e.g. image-only, tts, robotics, lyria).
 */
function isReasoningModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (
    lower.includes("-tts") ||
    lower.includes("-image") ||
    lower.includes("-transcribe") ||
    lower.includes("lyria") ||
    lower.includes("robotics") ||
    lower.includes("customtools") ||
    lower.includes("deep-research") ||
    lower.includes("preview-10-2025") ||
    lower.includes("preview-12-2025")
  ) {
    return false;
  }
  return true;
}

/**
 * Queries Google's ModelService.ListModels endpoint to fetch available models for the user's API key.
 */
export async function listGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return [];

  const versions = ["v1beta", "v1"];
  for (const ver of versions) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/${ver}/models?key=${cleanKey}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data?.models)) {
        const models: GeminiModelInfo[] = data.models
          .filter(
            (m: any) =>
              Array.isArray(m.supportedGenerationMethods) &&
              m.supportedGenerationMethods.includes("generateContent") &&
              isReasoningModel(m.name)
          )
          .map((m: any) => ({
            id: m.name.replace(/^models\//, ""),
            displayName: m.displayName || m.name.replace(/^models\//, ""),
            description: m.description,
            supportedMethods: m.supportedGenerationMethods || [],
          }));

        if (models.length > 0) {
          // Sort with flash-latest and pro-latest prioritized
          const priority = [
            "gemini-flash-latest",
            "gemini-pro-latest",
            "gemini-flash-lite-latest",
            "gemini-2.5-flash-lite",
            "gemini-2.5-pro",
            "gemini-2.5-flash",
          ];
          models.sort((a, b) => {
            const indexA = priority.indexOf(a.id);
            const indexB = priority.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.id.localeCompare(b.id);
          });
          return models;
        }
      }
    } catch {
      // try next version
    }
  }
  return [];
}

/**
 * Validates a Gemini API key with a fast ping request.
 * Automatically cycles through available models to find an active, enabled model.
 */
export async function testGeminiApiKey(
  apiKey: string,
  model: string = DEFAULT_MODEL,
): Promise<{
  success: boolean;
  message: string;
  model: string;
  availableModels?: GeminiModelInfo[];
}> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { success: false, message: "Please enter an API key.", model };
  }

  const tryCall = async (testModel: string, ver = "v1beta") => {
    const url = `https://generativelanguage.googleapis.com/${ver}/models/${testModel}:generateContent?key=${cleanKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: "Ping test. Return JSON: {\"status\": \"ok\"}" }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    });
    return res;
  };

  try {
    // 1. First attempt with requested model on v1beta
    let res = await tryCall(model, "v1beta");

    // 2. If 404 / not found, try v1
    if (res.status === 404) {
      res = await tryCall(model, "v1");
    }

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { success: true, message: `Connected successfully to ${model}!`, model };
      }
    }

    // 3. If failed or model not enabled, fetch available models for this specific key
    const availableModels = await listGeminiModels(cleanKey);

    // Candidates in priority order
    const priorityList = [
      "gemini-flash-latest",
      "gemini-pro-latest",
      "gemini-flash-lite-latest",
      "gemini-2.5-flash-lite",
      "gemini-2.5-pro",
      "gemini-1.5-flash-latest",
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-1.5-flash-002",
      "gemini-1.5-flash-001",
    ];

    const candidatesToTry: string[] = [];
    if (model) candidatesToTry.push(model);
    for (const p of priorityList) {
      if (!candidatesToTry.includes(p)) candidatesToTry.push(p);
    }
    for (const m of availableModels) {
      if (!candidatesToTry.includes(m.id)) candidatesToTry.push(m.id);
    }

    const tried = new Set<string>();
    for (const candidate of candidatesToTry) {
      if (tried.has(candidate)) continue;
      tried.add(candidate);

      try {
        const retryRes = await tryCall(candidate, "v1beta");
        if (retryRes.ok) {
          const data = await retryRes.json().catch(() => null);
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            setGeminiModel(candidate);
            return {
              success: true,
              message: `Connected successfully! Using active model "${candidate}".`,
              model: candidate,
              availableModels,
            };
          }
        }
      } catch {
        // try next candidate
      }
    }

    const errData = await res.json().catch(() => null);
    const errMsg = errData?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    return {
      success: false,
      message: `Could not connect with "${model}". Error: ${errMsg}`,
      model,
      availableModels,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Failed to reach Google Gemini API endpoints.",
      model,
    };
  }
}

let lastGeminiApiCallTime = 0;
export const MIN_GEMINI_CALL_INTERVAL_MS = 15000; // Strict 15-second minimum interval between external Gemini API calls

export function getGeminiCooldownRemainingMs(): number {
  const elapsed = Date.now() - lastGeminiApiCallTime;
  return Math.max(0, MIN_GEMINI_CALL_INTERVAL_MS - elapsed);
}

/**
 * Executes Layer 3 Causal Disambiguation using Google Gemini Flash.
 * Follows the DrainGuard §5.2 Function-Calling & Reasoning Contract.
 * Strictly rate-limited to at most once per 15 seconds to safeguard user quota.
 */
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
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  // Rate Limiting Guard: Enforce strict 15-second cooldown
  const now = Date.now();
  if (lastGeminiApiCallTime > 0 && now - lastGeminiApiCallTime < MIN_GEMINI_CALL_INTERVAL_MS) {
    const waitSec = Math.ceil((MIN_GEMINI_CALL_INTERVAL_MS - (now - lastGeminiApiCallTime)) / 1000);
    console.info(`[DrainGuard Quota Guard] Gemini call throttled (${waitSec}s remaining until 15s window). Returning null to allow heuristic fallback.`);
    return null;
  }

  const model = getGeminiModel();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

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

  const prompt = `You are the DrainGuard L3 AI Causal Disambiguation Engine for Bengaluru's Silk Board Junction stormwater network.
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

  try {
    const makeRequest = async (targetModel: string, ver = "v1beta") => {
      const url = `https://generativelanguage.googleapis.com/${ver}/models/${targetModel}:generateContent?key=${apiKey}`;
      return await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [
              {
                text: "You are DrainGuard L3 Stormwater Telemetry Classifier. Return ONLY a valid JSON object matching the requested schema. No markdown backticks or commentary outside JSON.",
              },
            ],
          },
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });
    };

    lastGeminiApiCallTime = Date.now();
    let response = await makeRequest(model, "v1beta");

    // If model not found or not enabled (!ok), try available flash models in order
    if (!response.ok) {
      for (const fallback of [
        "gemini-flash-latest",
        "gemini-pro-latest",
        "gemini-flash-lite-latest",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
      ]) {
        if (fallback === model) continue;
        const fbRes = await makeRequest(fallback, "v1beta");
        if (fbRes.ok) {
          response = fbRes;
          setGeminiModel(fallback);
          break;
        }
      }
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("Gemini API error:", response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
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

    return {
      drain_id: drain.drain_id,
      classification,
      blockage_probability: Math.min(100, Math.max(0, Number(parsed.blockage_probability) || 50)),
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
