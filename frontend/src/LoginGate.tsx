import { useState } from "react";
import { login } from "./kindeAuth";

export function LoginGate() {
  const [redirecting, setRedirecting] = useState(false);

  async function handleSignIn() {
    setRedirecting(true);
    await login();
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">UrbanFlow</p>
        <h1>Sign in to continue</h1>
        <p className="auth-sub">You'll be redirected to sign in securely, then brought right back.</p>
        <button type="button" className="auth-signin-btn" onClick={handleSignIn} disabled={redirecting}>
          {redirecting ? "Redirecting..." : "Continue to sign in"}
        </button>
      </div>
    </div>
  );
}
