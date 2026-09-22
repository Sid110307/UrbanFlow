const SESSION_KEY = "urbanflow-session";

interface Session {
  session: string;
  email: string;
  expires_at: number;
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.session || !parsed.expires_at || Date.now() > parsed.expires_at) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

export async function requestOtp(email: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const response = await fetch("/.netlify/functions/auth-request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data.error ?? "request_failed" };
    return { ok: true, token: data.token };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function verifyOtp(
  email: string,
  otp: string,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch("/.netlify/functions/auth-verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp, token }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data.error ?? "verify_failed" };
    saveSession({ session: data.session, email: data.email, expires_at: data.expires_at });
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
