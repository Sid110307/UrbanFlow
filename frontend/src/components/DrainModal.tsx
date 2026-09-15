import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { RISK_LABEL } from "../labels";
import type { DrainDetail, Incident } from "../types";

const TICK_STYLE = { fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5b6472" };

export function DrainModal({
  drainId,
  refreshSignal,
  onClose,
}: {
  drainId: string;
  refreshSignal: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DrainDetail | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getDrain(drainId), api.listIncidents(10, drainId)]).then(
      ([d, inc]) => {
        if (!cancelled) {
          setDetail(d);
          setIncidents(inc);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [drainId, refreshSignal]);

  const chartData =
    detail?.history.map((h) => ({
      time: new Date(h.timestamp).toLocaleTimeString(),
      water_level_cm: h.water_level_cm,
      flow_velocity_x10: h.flow_velocity_mps * 10,
      turbidity_ntu: h.turbidity_ntu,
    })) ?? [];

  const latestIncident = incidents[0];
  const latestReading = detail?.latest_reading;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{detail?.name ?? drainId}</h2>
            <span className={`badge badge-${detail?.status ?? "green"}`}>
              {RISK_LABEL[detail?.status ?? "green"]}
            </span>
          </div>
          <button className="close-btn" onClick={onClose}>
            close
          </button>
        </div>

        <div className="modal-body">
          {latestReading && (
            <div className="field-grid">
              <div className="field-cell">
                <span className="field-label">Water level</span>
                <span className="field-value">{latestReading.water_level_cm.toFixed(1)} cm</span>
              </div>
              <div className="field-cell">
                <span className="field-label">Flow velocity</span>
                <span className="field-value">{latestReading.flow_velocity_mps.toFixed(2)} m/s</span>
              </div>
              <div className="field-cell">
                <span className="field-label">Turbidity</span>
                <span className="field-value">{latestReading.turbidity_ntu.toFixed(0)} NTU</span>
              </div>
              <div className="field-cell">
                <span className="field-label">Precipitation</span>
                <span className="field-value">{latestReading.precip_rate_mm_hr.toFixed(1)} mm/hr</span>
              </div>
            </div>
          )}

          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="2 4" stroke="#d7dce2" />
                <XAxis dataKey="time" tick={TICK_STYLE} hide={chartData.length > 12} />
                <YAxis tick={TICK_STYLE} />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #d7dce2",
                    fontFamily: "IBM Plex Mono",
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "#5b6472" }}
                />
                <Legend wrapperStyle={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#5b6472" }} />
                <Line type="monotone" dataKey="water_level_cm" stroke="#0f7a8c" dot={false} strokeWidth={1.5} name="water level (cm)" />
                <Line type="monotone" dataKey="flow_velocity_x10" stroke="#6b8f3d" dot={false} strokeWidth={1.5} name="flow velocity (x10 m/s)" />
                <Line type="monotone" dataKey="turbidity_ntu" stroke="#a8455a" dot={false} strokeWidth={1.5} name="turbidity (NTU)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {latestIncident ? (
            <div className="reasoning-panel">
              <h3>Causal reasoning</h3>
              <p className="mono-note">
                classification: <strong>{latestIncident.classification}</strong> &middot; blockage
                probability: <strong>{latestIncident.blockage_probability.toFixed(0)}%</strong>
              </p>
              <p>{latestIncident.reasoning}</p>
              {latestIncident.graph_narrative && (
                <>
                  <h3>Graph context</h3>
                  <p>{latestIncident.graph_narrative}</p>
                </>
              )}
              {latestIncident.trigger_visual_triage && (
                <>
                  <h3>Visual triage</h3>
                  <div className="visual-triage">
                    {latestIncident.camera_image_path && (
                      <img src={latestIncident.camera_image_path} alt="camera frame" />
                    )}
                    <div>
                      <p>
                        debris: <strong>{latestIncident.debris_class}</strong> (
                        {latestIncident.debris_confidence?.toFixed(0)}% confidence)
                      </p>
                      <p>{latestIncident.debris_rationale}</p>
                    </div>
                  </div>
                </>
              )}
              {latestIncident.dispatch_text && (
                <>
                  <h3>Crew dispatch message</h3>
                  <p className="chat-bubble">{latestIncident.dispatch_text}</p>
                </>
              )}
              {latestIncident.alert_text && (
                <>
                  <h3>Citizen alert (SMS)</h3>
                  <p className="chat-bubble">{latestIncident.alert_text}</p>
                </>
              )}
            </div>
          ) : (
            <p className="mono-note">No anomaly logged yet for this node.</p>
          )}

          <h3>Recent incidents</h3>
          <ul className="incident-mini-list">
            {incidents.map((inc) => (
              <li key={inc.id}>
                <span className={`badge badge-${inc.risk_level}`}>{RISK_LABEL[inc.risk_level]}</span>
                {new Date(inc.timestamp).toLocaleTimeString()} &mdash; {inc.classification} (
                {inc.blockage_probability.toFixed(0)}%)
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
