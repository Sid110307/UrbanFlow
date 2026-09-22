import { createHash, createHmac } from "node:crypto";

const OTP_TTL_MS = 5 * 60 * 1000;
const INSTANCE_LIMIT = 30;
let windowStart = Date.now();
const requestCounts = new Map<string, number>();

function withinInstanceLimit(email: string): boolean {
  const now = Date.now();
  if (now - windowStart > 60 * 60 * 1000) {
    windowStart = now;
    requestCounts.clear();
  }
  const count = requestCounts.get(email) ?? 0;
  if (count >= 5) return false;
  requestCounts.set(email, count + 1);
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

export default async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const secret = process.env.AUTH_OTP_SECRET;
  const resendKey = process.env.RESEND_API_KEY;
  if (!secret || !resendKey) {
    return json(503, { error: "not_configured" });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request" });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return json(400, { error: "invalid_email" });
  }

  if (!withinInstanceLimit(email)) {
    return json(429, { error: "rate_limited" });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const exp = Date.now() + OTP_TTL_MS;
  const otpHash = createHash("sha256").update(`${otp}:${email}:${secret}`).digest("hex");

  const payload = base64url(JSON.stringify({ email, otpHash, exp }));
  const token = `${payload}.${sign(payload, secret)}`;

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: "UrbanFlow <onboarding@resend.dev>",
        to: [email],
        subject: "Your UrbanFlow login code",
        html: `<p>Your UrbanFlow login code is <strong style="font-size:20px">${otp}</strong>.</p><p>It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>`,
      }),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text().catch(() => "");
      console.error("resend send failed", emailResponse.status, errText.slice(0, 300));
      return json(502, { error: "email_send_failed" });
    }
  } catch {
    return json(502, { error: "email_send_failed" });
  }

  return json(200, { token, expires_in_ms: OTP_TTL_MS });
};
