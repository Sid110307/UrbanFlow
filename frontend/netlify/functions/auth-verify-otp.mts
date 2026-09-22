import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
let windowStart = Date.now();
const attemptCounts = new Map<string, number>();

function withinAttemptLimit(email: string): boolean {
  const now = Date.now();
  if (now - windowStart > 60 * 60 * 1000) {
    windowStart = now;
    attemptCounts.clear();
  }
  const count = attemptCounts.get(email) ?? 0;
  if (count >= MAX_ATTEMPTS) return false;
  attemptCounts.set(email, count + 1);
  return true;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = sign(payload, secret);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const secret = process.env.AUTH_OTP_SECRET;
  if (!secret) {
    return json(503, { error: "not_configured" });
  }

  let body: { email?: string; otp?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request" });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const otp = typeof body.otp === "string" ? body.otp.trim() : "";
  const token = typeof body.token === "string" ? body.token : "";
  if (!email || !/^\d{6}$/.test(otp) || !token.includes(".")) {
    return json(400, { error: "bad_request" });
  }

  if (!withinAttemptLimit(email)) {
    return json(429, { error: "rate_limited" });
  }

  const dotIndex = token.lastIndexOf(".");
  const payloadB64 = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  if (!verifySignature(payloadB64, signature, secret)) {
    return json(401, { error: "invalid_token" });
  }

  let challenge: { email?: string; otpHash?: string; exp?: number };
  try {
    challenge = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return json(400, { error: "bad_request" });
  }

  if (!challenge.exp || Date.now() > challenge.exp) {
    return json(401, { error: "expired" });
  }

  if (challenge.email !== email) {
    return json(401, { error: "email_mismatch" });
  }

  const expectedHash = createHash("sha256").update(`${otp}:${email}:${secret}`).digest("hex");
  const providedHashBuf = Buffer.from(challenge.otpHash ?? "", "hex");
  const expectedHashBuf = Buffer.from(expectedHash, "hex");
  const otpMatches =
    providedHashBuf.length === expectedHashBuf.length && timingSafeEqual(providedHashBuf, expectedHashBuf);

  if (!otpMatches) {
    return json(401, { error: "invalid_otp" });
  }

  const sessionExp = Date.now() + SESSION_TTL_MS;
  const sessionPayload = base64url(JSON.stringify({ email, iat: Date.now(), exp: sessionExp }));
  const sessionToken = `${sessionPayload}.${sign(sessionPayload, secret)}`;

  return json(200, { session: sessionToken, email, expires_at: sessionExp });
};
