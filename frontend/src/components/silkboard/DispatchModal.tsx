import { useEffect, useRef, useState } from "react";
import { DRAIN_NODES } from "../../silkboard";
import type { AgentDetection } from "../../types";

type DeliveryStage = "draft" | "sent" | "delivered" | "read";

export function DispatchModal({
  detection,
  onClose,
}: {
  detection: AgentDetection;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<DeliveryStage>("draft");
  const [smsSent, setSmsSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function handleDispatch() {
    if (stage !== "draft") return;
    setStage("sent");
    timers.current.push(setTimeout(() => setStage("delivered"), 900));
    timers.current.push(setTimeout(() => setStage("read"), 2700));
  }

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const dispatched = stage !== "draft";

  const isBlockage =
    detection.classification === "confirmed_blockage" ||
    detection.classification === "probable_blockage";

  const imageSrc =
    detection.visual_result?.camera_id === "CAM-01"
      ? "/cctv/cam01_alert.jpg"
      : detection.visual_result?.camera_id === "CAM-02"
      ? "/cctv/cam02_alert.jpg"
      : "/cctv/cam03_alert.jpg";

  const crewType =
    detection.dispatch_action ||
    (isBlockage
      ? "Emergency Desilting Crew #4, Heavy Debris Removal Unit"
      : "Rapid Response Drainage Patrol, Stormwater Runoff Monitoring");

  const confidencePct = detection.visual_result?.confidence ?? detection.blockage_probability;
  const minutesToBreach = Math.max(4, Math.round(30 - confidencePct / 3.5));

  const node = DRAIN_NODES.find((n) => n.drain_id === detection.drain_id);
  const [lon, lat] = node?.position ?? [77.6229, 12.9172];
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
  const mapsEmbedUrl = `https://maps.google.com/maps?q=${lat},${lon}&z=16&output=embed`;

  const jsonPayload = {
    to: "+919845012345",
    type: "template",
    template: {
      name: "drain_dispatch_alert",
      language: { code: "en" },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "image",
              image: { link: `https://urbanflow.bbmp.gov.in${imageSrc}` },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: detection.drain_id },
            {
              type: "text",
              text: detection.visual_result
                ? `${detection.visual_result.debris_class.replace("_", " ")}, Class 2`
                : "Obstruction Anomaly",
            },
            {
              type: "text",
              text: `${detection.visual_result?.confidence ?? detection.blockage_probability}% confidence`,
            },
            { type: "text", text: `${minutesToBreach} minutes to overflow` },
            {
              type: "text",
              text: `urbanflow.bbmp.gov.in/incident/${detection.drain_id.toLowerCase()}`,
            },
          ],
        },
      ],
    },
  };

  const handleCopyJson = () => {
    navigator.clipboard?.writeText(JSON.stringify(jsonPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dispatch-modal-backdrop" onClick={onClose}>
      <div className="dispatch-modal" onClick={(e) => e.stopPropagation()}>
        <header className="dispatch-modal-header">
          <div>
            <h3>Field Dispatch System</h3>
            <p>Municipal crew alerting via WhatsApp and SMS</p>
          </div>
          <button type="button" className="dispatch-modal-close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="dispatch-modal-body">
          <div className="whatsapp-device-frame">
            <div className="whatsapp-app-bar">
              <div className="whatsapp-avatar">WA</div>
              <div className="whatsapp-contact-info">
                <strong>BBMP SEOC Dispatch Bot</strong>
                <span className="whatsapp-verified">
                  {stage === "delivered" ? "typing..." : "online"}
                </span>
              </div>
            </div>

            <div className="whatsapp-chat-canvas">
              <div className="whatsapp-date-pill">TODAY</div>

              <div className="whatsapp-bubble">
                <div className="whatsapp-media-header">
                  <img src={imageSrc} alt="Incident Site CCTV" />
                  <span className="whatsapp-media-badge">
                    {detection.visual_result?.camera_id ?? "CCTV"} • LIVE VERIFICATION
                  </span>
                </div>

                <div className="whatsapp-body-content">
                  <h4>CRITICAL DRAIN INCIDENT DISPATCH</h4>
                  <p>
                    <strong>Node ID:</strong> <code>{detection.drain_id}</code>
                  </p>
                  <p>
                    <strong>Classification:</strong>{" "}
                    <span className="badge-alert">
                      {detection.classification.replace("_", " ").toUpperCase()}
                    </span>
                  </p>
                  <p>
                    <strong>Confidence:</strong>{" "}
                    {detection.visual_result?.confidence ?? detection.blockage_probability}% (
                    {detection.engine_source === "gemini-live" ? "Gemini Flash Live" : "UrbanFlow AI"}
                    )
                  </p>
                  {detection.visual_result && (
                    <p>
                      <strong>Debris Type:</strong>{" "}
                      {detection.visual_result.debris_class.replace("_", " ").toUpperCase()}
                    </p>
                  )}
                  <p>
                    <strong>Recommended Action:</strong> {crewType}
                  </p>
                  <p>
                    <strong>Est. Time to Breach:</strong> ~{minutesToBreach} mins without clearance
                  </p>
                  <hr className="whatsapp-divider" />
                  <p className="whatsapp-footer-note">
                    <em>Track in real-time: urbanflow.bbmp.gov.in/incident/{detection.drain_id.toLowerCase()}</em>
                  </p>
                </div>

                <div className="whatsapp-msg-meta">
                  {stage === "draft" ? (
                    <span className="whatsapp-preview-tag">Preview, not yet sent</span>
                  ) : (
                    <>
                      <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className={stage === "read" ? "whatsapp-double-check" : "whatsapp-single-check"}>
                        {stage === "sent" ? "✓" : "✓✓"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="whatsapp-bubble whatsapp-location-bubble">
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="whatsapp-location-map">
                  <iframe
                    src={mapsEmbedUrl}
                    title="Incident location map"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                  <span className="whatsapp-location-pin">📍</span>
                </a>
                <div className="whatsapp-location-info">
                  <strong>{node?.label ?? "Silk Board Junction"}</strong>
                  <span>{lat.toFixed(5)}, {lon.toFixed(5)}</span>
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="whatsapp-location-open">
                    Open in Google Maps
                  </a>
                </div>
                <div className="whatsapp-msg-meta">
                  {stage === "draft" ? (
                    <span className="whatsapp-preview-tag">Preview, not yet sent</span>
                  ) : (
                    <>
                      <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className={stage === "read" ? "whatsapp-double-check" : "whatsapp-single-check"}>
                        {stage === "sent" ? "✓" : "✓✓"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {stage === "read" && (
                <div className="whatsapp-system-msg">
                  Field Crew #4 acknowledged receipt via WhatsApp Cloud API webhook.
                </div>
              )}
            </div>
          </div>

          <div className="dispatch-action-panel">
            <div className="action-card">
              <h4>Dispatch Actions</h4>
              <p className="action-desc">
                Trigger automated notifications to municipal field units and alert commuters along the Silk Board corridor.
              </p>

              <div className="action-buttons">
                <button
                  type="button"
                  className={`btn-dispatch-primary ${dispatched ? "is-dispatched" : ""}`}
                  onClick={handleDispatch}
                  disabled={dispatched}
                >
                  {stage === "draft"
                    ? "Send WhatsApp Dispatch to Crew"
                    : stage === "sent"
                      ? "Sending..."
                      : stage === "delivered"
                        ? "Delivered to crew..."
                        : "Crew Dispatched via WhatsApp"}
                </button>

                <button
                  type="button"
                  className={`btn-dispatch-sms ${smsSent ? "is-sent" : ""}`}
                  onClick={() => setSmsSent(true)}
                >
                  {smsSent ? "SMS Broadcast Queued" : "Broadcast Citizen SMS Warning (Kodi-Silk Board)"}
                </button>

                <button
                  type="button"
                  className="btn-dispatch-copy"
                  onClick={handleCopyJson}
                >
                  {copied ? "Copied Payload to Clipboard" : "Copy WhatsApp API Payload"}
                </button>
              </div>
            </div>

            <div className="action-card raw-contract-card">
              <button
                type="button"
                className="btn-toggle-payload"
                onClick={() => setShowPayload((v) => !v)}
              >
                {showPayload ? "Hide" : "View"} WhatsApp Cloud API Payload
              </button>
              {showPayload && (
                <pre className="json-code-block">{JSON.stringify(jsonPayload, null, 2)}</pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
