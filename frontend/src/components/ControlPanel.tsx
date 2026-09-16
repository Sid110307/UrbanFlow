import { useState } from "react";
import { api } from "../api";
import type { Drain } from "../types";

export function ControlPanel({ drains }: { drains: Drain[] }) {
  const [drainId, setDrainId] = useState(drains[0]?.drain_id ?? "");
  const [busy, setBusy] = useState(false);
  const [rainIntensity, setRainIntensity] = useState(45);

  const effectiveId = drainId || drains[0]?.drain_id || "";

  async function run(action: () => Promise<unknown>) {
    if (!effectiveId) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3>Manual controls</h3>
      <select value={effectiveId} onChange={(e) => setDrainId(e.target.value)}>
        {drains.map((d) => (
          <option key={d.drain_id} value={d.drain_id}>
            {d.name}
          </option>
        ))}
      </select>

      <div className="rain-slider">
        <label htmlFor="rain-intensity">
          Rain intensity: {rainIntensity} mm/hr
        </label>
        <input
          id="rain-intensity"
          type="range"
          min={10}
          max={80}
          step={5}
          value={rainIntensity}
          onChange={(e) => setRainIntensity(Number(e.target.value))}
        />
      </div>

      <div className="control-buttons">
        <button disabled={busy} onClick={() => run(() => api.injectRain(effectiveId, rainIntensity))}>
          Inject rain
        </button>
        <button
          disabled={busy}
          className="danger"
          onClick={() => run(() => api.injectBlockage(effectiveId, "plastic"))}
        >
          Inject plastic blockage
        </button>
        <button
          disabled={busy}
          className="danger"
          onClick={() => run(() => api.injectBlockage(effectiveId, "silt"))}
        >
          Inject silt blockage
        </button>
        <button
          disabled={busy}
          className="danger"
          onClick={() => run(() => api.injectBlockage(effectiveId, "construction_debris"))}
        >
          Inject construction debris
        </button>
        <button disabled={busy} onClick={() => run(() => api.clearDrain(effectiveId))}>
          Clear / reset drain
        </button>
      </div>
      <p className="mono-note">
        Takes effect on the next reading (~few seconds). Gemini reasoning runs
        automatically once a reading crosses the anomaly threshold.
      </p>
    </div>
  );
}
