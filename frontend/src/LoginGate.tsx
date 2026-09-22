import { useState, type FormEvent } from "react";
import { requestOtp, verifyOtp } from "./auth";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "That doesn't look like a valid email address.",
  rate_limited: "Too many attempts. Wait a bit and try again.",
  email_send_failed: "Couldn't send the email. Try again shortly.",
  not_configured: "Login isn't configured on this deployment yet.",
  invalid_token: "That code has expired. Request a new one.",
  expired: "That code has expired. Request a new one.",
  invalid_otp: "Incorrect code. Check your email and try again.",
  network_error: "Network error. Check your connection and try again.",
};

function errorText(code: string): string {
  return ERROR_MESSAGES[code] ?? "Something went wrong. Try again.";
}

export function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await requestOtp(email.trim().toLowerCase());
    setLoading(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setToken(result.token);
    setStep("otp");
  }

  async function handleOtpSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await verifyOtp(email.trim().toLowerCase(), otp.trim(), token);
    setLoading(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    onSuccess();
  }

  async function handleResend() {
    setLoading(true);
    setError(null);
    const result = await requestOtp(email.trim().toLowerCase());
    setLoading(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setToken(result.token);
    setOtp("");
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">UrbanFlow</p>
        <h1>Sign in to continue</h1>

        {step === "email" ? (
          <form className="auth-form" onSubmit={handleEmailSubmit}>
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={loading || !email.trim()}>
              {loading ? "Sending code..." : "Send login code"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleOtpSubmit}>
            <p className="auth-sub">
              We sent a 6-digit code to <strong>{email}</strong>.
            </p>
            <label htmlFor="auth-otp">Verification code</label>
            <input
              id="auth-otp"
              type="text"
              inputMode="numeric"
              autoFocus
              required
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="auth-otp-input"
            />
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={loading || otp.length !== 6}>
              {loading ? "Verifying..." : "Verify and sign in"}
            </button>
            <div className="auth-form-links">
              <button type="button" className="auth-link" onClick={() => setStep("email")}>
                Use a different email
              </button>
              <button type="button" className="auth-link" onClick={handleResend} disabled={loading}>
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
