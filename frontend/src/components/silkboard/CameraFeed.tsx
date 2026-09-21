import { useMemo, useState } from "react";
import { CAMERAS, DRAIN_NODES, ROAD_SENSORS } from "../../data/silkboard";
import { DispatchModal } from "./DispatchModal";
import type {
  AgentDetection,
  SilkboardCameraState,
  SilkboardRoadSensorReading,
  SilkboardSnapshot,
} from "../../types";

// ─── Synthetic CCTV Feed Assets ─────────────────────────────────────────────

function getCameraImage(cameraId: string, isAlert: boolean): string {
  if (cameraId === "CAM-03") {
    return isAlert ? "/cctv/cam_debris.jpg" : "/cctv/cam_normal.jpg";
  }
  if (cameraId === "CAM-02") {
    return isAlert ? "/cctv/cam_waterlogged.jpg" : "/cctv/cam_normal.jpg";
  }
  return isAlert ? "/cctv/cam_waterlogged.jpg" : "/cctv/cam_normal.jpg";
}

function getDetectionBoxInfo(cameraId: string, confidence: number) {
  if (cameraId === "CAM-03") {
    return {
      label: `DEBRIS CHOKE: PLASTIC/SILT — ${confidence}%`,
      className: "box-debris",
    };
  }
  if (cameraId === "CAM-02") {
    return {
      label: `UNDERPASS SURCHARGE >30cm — ${confidence}%`,
      className: "box-underpass",
    };
  }
  return {
    label: `ROADWAY WATERLOGGING — ${confidence}%`,
    className: "box-roadway",
  };
}

function formatSimTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function CameraFeedCanvas({
  cameraId,
  label,
  status,
  waterloggingConfidence,
  detectionActive,
  elapsedSeconds,
  nearbyFloodingSensors,
}: {
  cameraId: string;
  label: string;
  status: "online" | "alert" | "offline";
  waterloggingConfidence: number;
  detectionActive: boolean;
  elapsedSeconds: number;
  nearbyFloodingSensors: number;
}) {
  const isAlerting = detectionActive || status === "alert";
  const bgImage = getCameraImage(cameraId, isAlerting);
  const boxInfo = getDetectionBoxInfo(cameraId, waterloggingConfidence);

  return (
    <div className={`camera-feed-frame ${isAlerting ? "is-alert" : ""}`}>
      {/* Real-time Simulated CCTV viewport */}
      <div className="camera-viewport">
        {/* Photorealistic CCTV Frame */}
        <img
          src={bgImage}
          alt={`CCTV ${cameraId}`}
          className="camera-video-bg"
          loading="eager"
        />

        {/* Scan lines (authentic CRT effect) */}
        <div className="camera-scanlines" />

        {/* AI Detection bounding box with YOLO style label */}
        {detectionActive && (
          <div className={`camera-detection-box ${boxInfo.className}`}>
            <span className="detection-label">
              {boxInfo.label}
            </span>
          </div>
        )}

        {/* HUD overlay */}
        <div className="camera-hud">
          <div className="camera-hud-top">
            <div className="camera-badge-group">
              <span className="camera-id-badge">{cameraId}</span>
              <span className="camera-rec-badge">● REC</span>
            </div>
            <span className={`camera-status-badge status-${status}`}>
              <i /> {status.toUpperCase()}
            </span>
          </div>
          <div className="camera-hud-bottom">
            <span className="camera-timestamp">
              T+ {formatSimTime(elapsedSeconds)}
            </span>
            <span className="camera-label">{label}</span>
          </div>
        </div>

        {/* Alert banner */}
        {detectionActive && (
          <div className="camera-alert-banner">
            ⚠ WATERLOGGING DETECTED — {nearbyFloodingSensors} sensor{nearbyFloodingSensors !== 1 ? "s" : ""} confirming
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Camera detail modal ────────────────────────────────────────────────────

export function CameraDetailModal({
  cameraId,
  snapshot,
  latestDetection,
  onClose,
}: {
  cameraId: string;
  snapshot: SilkboardSnapshot;
  latestDetection: AgentDetection | null;
  onClose: () => void;
}) {
  const [showDispatch, setShowDispatch] = useState(false);
  const camera = CAMERAS.find((c) => c.id === cameraId);
  const cameraState = snapshot.cameras.find((c) => c.camera_id === cameraId);

  if (!camera || !cameraState) return null;

  // Find nearby sensor readings
  const nearbySensors = ROAD_SENSORS.filter((s) => {
    const dist = Math.sqrt(
      (s.position[0] - camera.position[0]) ** 2 +
      (s.position[1] - camera.position[1]) ** 2,
    );
    return dist < camera.coverage_radius / 100000;
  });

  const nearbyReadings = nearbySensors
    .map((s) => snapshot.road_sensors.find((r) => r.sensor_id === s.id))
    .filter(Boolean) as SilkboardRoadSensorReading[];

  const floodingCount = nearbyReadings.filter(
    (r) => r.status === "flooding" || r.status === "pooling",
  ).length;

  return (
    <>
      <div className="camera-modal-backdrop" onClick={onClose}>
        <div className="camera-modal" onClick={(e) => e.stopPropagation()}>
          <header className="camera-modal-header">
            <div>
              <h3>📹 {camera.id} — {camera.label}</h3>
              <span className={`camera-status-inline status-${cameraState.status}`}>
                <i /> {cameraState.status.toUpperCase()}
                {cameraState.detection_active &&
                  ` — ${cameraState.waterlogging_confidence}% waterlogging confidence`}
              </span>
            </div>
            <button type="button" onClick={onClose} className="camera-modal-close">
              ✕
            </button>
          </header>

          <div className="camera-modal-body">
            <div className="camera-modal-feed-container">
              <CameraFeedCanvas
                cameraId={camera.id}
                label={camera.label}
                status={cameraState.status}
                waterloggingConfidence={cameraState.waterlogging_confidence}
                detectionActive={cameraState.detection_active}
                elapsedSeconds={snapshot.config.elapsed_seconds}
                nearbyFloodingSensors={floodingCount}
              />
            </div>

            <div className="camera-modal-info">
              <div className="camera-info-section">
                <h4>Nearby Surface Sensors</h4>
                <div className="camera-sensor-grid">
                  {nearbyReadings.map((reading) => (
                    <div
                      key={reading.sensor_id}
                      className={`camera-sensor-card status-${reading.status}`}
                    >
                      <strong>{reading.sensor_id}</strong>
                      <span>{reading.water_depth_cm.toFixed(1)} cm</span>
                      <span className={`sensor-status-badge ${reading.status}`}>
                        {reading.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {latestDetection && latestDetection.visual_result?.camera_id === cameraId && (
                <div className="camera-info-section">
                  <h4>Visual Triage Result</h4>
                  <div className="visual-triage-card">
                    <div className="triage-class">
                      <span className="triage-label">Debris Classification</span>
                      <strong>{latestDetection.visual_result.debris_class.replace("_", " ")}</strong>
                    </div>
                    <div className="triage-confidence">
                      <span className="triage-label">Confidence</span>
                      <strong>{latestDetection.visual_result.confidence}%</strong>
                    </div>
                    {latestDetection.dispatch_action && (
                      <div className="triage-dispatch">
                        <span className="triage-label">Dispatch Recommendation</span>
                        <span>{latestDetection.dispatch_action}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn-open-dispatch"
                      onClick={() => setShowDispatch(true)}
                    >
                      📱 View WhatsApp Field Dispatch Alert
                    </button>
                  </div>
                </div>
              )}

              {!latestDetection && !cameraState.detection_active && (
                <div className="camera-info-section camera-clear">
                  <p>No anomalies detected in camera coverage area. All nearby road sensors within normal range.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDispatch && latestDetection && (
        <DispatchModal
          detection={latestDetection}
          onClose={() => setShowDispatch(false)}
        />
      )}
    </>
  );
}

// ─── Camera thumbnail strip ─────────────────────────────────────────────────

export function CameraStrip({
  snapshot,
  onSelectCamera,
}: {
  snapshot: SilkboardSnapshot | null;
  onSelectCamera: (id: string) => void;
}) {
  if (!snapshot) return null;

  return (
    <div className="camera-strip">
      <span className="camera-strip-label">📹 Live Feeds</span>
      <div className="camera-strip-row">
        {CAMERAS.map((camera) => {
          const state = snapshot.cameras.find((c) => c.camera_id === camera.id);
          const status = state?.status ?? "online";

          // Count nearby flooding sensors
          const nearbySensors = ROAD_SENSORS.filter((s) => {
            const dist = Math.sqrt(
              (s.position[0] - camera.position[0]) ** 2 +
              (s.position[1] - camera.position[1]) ** 2,
            );
            return dist < camera.coverage_radius / 100000;
          });
          const nearbyReadings = nearbySensors
            .map((s) => snapshot.road_sensors.find((r) => r.sensor_id === s.id))
            .filter(Boolean) as SilkboardRoadSensorReading[];
          const floodingCount = nearbyReadings.filter(
            (r) => r.status === "flooding" || r.status === "pooling",
          ).length;

          return (
            <button
              key={camera.id}
              type="button"
              className={`camera-thumb ${status === "alert" ? "is-alert" : ""}`}
              onClick={() => onSelectCamera(camera.id)}
            >
              <CameraFeedCanvas
                cameraId={camera.id}
                label={camera.label}
                status={status}
                waterloggingConfidence={state?.waterlogging_confidence ?? 0}
                detectionActive={state?.detection_active ?? false}
                elapsedSeconds={snapshot.config.elapsed_seconds}
                nearbyFloodingSensors={floodingCount}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
