const MODELS = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-flash-lite-latest"];
const MAX_PROMPT_CHARS = 16000;
const REQUEST_TIMEOUT_MS = 10000;
const OVERALL_DEADLINE_MS = 20000;

const INSTANCE_LIMIT = 200;
let windowStart = Date.now();
let requestCount = 0;

function withinInstanceLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > 24 * 60 * 60 * 1000) {
    windowStart = now;
    requestCount = 0;
  }
  if (requestCount >= INSTANCE_LIMIT) return false;
  requestCount += 1;
  return true;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(503, { error: "not_configured" });
  }

  if (!withinInstanceLimit()) {
    return json(429, { error: "rate_limited" });
  }

  let body: { prompt?: string; systemInstruction?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request" });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const systemInstruction = typeof body.systemInstruction === "string" ? body.systemInstruction : "";
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return json(400, { error: "bad_request" });
  }

  let lastError: { status: number; body: Record<string, unknown> } = {
    status: 502,
    body: { error: "upstream_error" },
  };

  const overallDeadline = Date.now() + OVERALL_DEADLINE_MS;

  for (const model of MODELS) {
    const remaining = overallDeadline - Date.now();
    if (remaining <= 0) break;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, remaining));

    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            ...(systemInstruction
              ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
              : {}),
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
          }),
          signal: controller.signal,
        },
      );

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => "");
        console.error("gemini upstream error", model, upstream.status, errText.slice(0, 500));
        lastError = { status: 502, body: { error: "upstream_error" } };
        continue;
      }

      const data = (await upstream.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = { status: 502, body: { error: "empty_response" } };
        continue;
      }

      return json(200, { text });
    } catch {
      console.error("gemini request failed", model);
      lastError = { status: 504, body: { error: "timeout" } };
    } finally {
      clearTimeout(timeout);
    }
  }

  return json(lastError.status, lastError.body);
};
