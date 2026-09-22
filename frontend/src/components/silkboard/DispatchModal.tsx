import { useState } from "react";
import type { AgentDetection } from "../../types";

export function DispatchModal({
  detection,
  onClose,
}: {
  detection: AgentDetection;
  onClose: () => void;
}) {
  const [dispatched, setDispatched] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [copied, setCopied] = useState(false);

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
            { type: "text", text: "12 minutes to overflow" },
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
            <p>Layer 4 Decision & Layer 5 WhatsApp / SMS Delivery (§5.3)</p>
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
                <span className="whatsapp-verified">Official Municipal Channel</span>
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
                    {detection.engine_source === "gemini-live" ? "Gemini Flash Live" : "DrainGuard AI"}
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
                    <strong>Est. Time to Breach:</strong> ~12 mins without clearance
                  </p>
                  <hr className="whatsapp-divider" />
                  <p className="whatsapp-footer-note">
                    <em>Track in real-time: urbanflow.bbmp.gov.in/incident/{detection.drain_id.toLowerCase()}</em>
                  </p>
                </div>

                <div className="whatsapp-msg-meta">
                  <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="whatsapp-double-check">✓✓</span>
                </div>
              </div>

              {dispatched && (
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
                  onClick={() => setDispatched(true)}
                >
                  {dispatched ? "Crew Dispatched via WhatsApp" : "Send WhatsApp Dispatch to Crew"}
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
                  {copied ? "Copied Payload to Clipboard" : "Copy §5.3 JSON Contract"}
                </button>
              </div>
            </div>

            <div className="action-card raw-contract-card">
              <h4>Architecture Contract (§5.3 Payload)</h4>
              <pre className="json-code-block">{JSON.stringify(jsonPayload, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
