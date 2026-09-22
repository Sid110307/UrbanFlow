import { useMemo, useState, useEffect, useRef } from "react";
import { CAMERAS, DRAIN_NODES, ROAD_SENSORS, distance } from "../../silkboard";
import { DispatchModal } from "./DispatchModal";
import { ObjectScan } from "./ObjectScan";
import type {
  AgentDetection,
  SilkboardRoadSensorReading,
  SilkboardSnapshot,
} from "../../types";

export function getCameraImage(cameraId: string, isAlert: boolean): string {
  if (cameraId === "CAM-01") {
    return isAlert ? "/cctv/cam01_alert.jpg" : "/cctv/cam01_normal.jpg";
  }
  if (cameraId === "CAM-02") {
    return isAlert ? "/cctv/cam02_alert.jpg" : "/cctv/cam02_normal.jpg";
  }
  if (cameraId === "CAM-03") {
    return isAlert ? "/cctv/cam03_alert.jpg" : "/cctv/cam03_normal.jpg";
  }
  return isAlert ? "/cctv/cam02_alert.jpg" : "/cctv/cam02_normal.jpg";
}

export interface OpticalDetectionBox {
  id: string;
  label: string;
  sublabel?: string;
  confidence: number;
  className: string;
  style: React.CSSProperties;
}

export function getDetectionBoxes(cameraId: string, confidence: number): OpticalDetectionBox[] {
  if (cameraId === "CAM-01") {
    return [
      {
        id: "cam01-box1",
        label: `PONDING: 24cm CURB ACCUMULATION, ${confidence}%`,
        sublabel: "Hosur Road North Carriageway",
        confidence,
        className: "box-roadway",
        style: { top: "52%", left: "3%", width: "42%", height: "42%" },
      },
      {
        id: "cam01-box2",
        label: `VEHICLES WADING, SPEED -75%`,
        sublabel: "Auto-rickshaws & Cars",
        confidence: Math.max(70, confidence - 5),
        className: "box-secondary",
        style: { top: "45%", left: "44%", width: "24%", height: "26%" },
      },
    ];
  }

  if (cameraId === "CAM-02") {
    return [
      {
        id: "cam02-box1",
        label: `UNDERPASS SURCHARGE: 40cm FLASH FLOOD, ${confidence}%`,
        sublabel: "Silk Board Grade-Level Nexus",
        confidence,
        className: "box-underpass",
        style: { top: "35%", left: "6%", width: "88%", height: "58%" },
      },
      {
        id: "cam02-box2",
        label: `BMTC BUS SUBMERGED AXLE`,
        sublabel: "Severe Transit Obstruction",
        confidence: Math.max(75, confidence - 3),
        className: "box-secondary",
        style: { top: "33%", left: "26%", width: "16%", height: "23%" },
      },
    ];
  }

  return [
    {
      id: "cam03-box1",
      label: `DEBRIS CHOKE: CONCRETE RUBBLE + SILT, ${confidence}%`,
      sublabel: "Storm Drain Grate 90% Blocked",
      confidence,
      className: "box-debris",
      style: { top: "38%", left: "32%", width: "44%", height: "50%" },
    },
    {
      id: "cam03-box2",
      label: `SURFACE WATER BACKFLOW: 16cm`,
      sublabel: "Water Pooling on Footpath Curb",
      confidence: Math.max(72, confidence - 4),
      className: "box-secondary",
      style: { top: "28%", left: "25%", width: "36%", height: "26%" },
    },
  ];
}

const CAMERA_SPECS: Record<
  string,
  {
    location: string;
    ptz: string;
    lens: string;
    elevation: string;
    coverage: string;
    targetDrain: string;
  }
> = {
  "CAM-01": {
    location: "Hosur Road North Approach",
    ptz: "AZ 165° · EL -14° · 1.0x Optical",
    lens: "2.8mm F/1.6 Starlight WDR",
    elevation: "7.5m Above Grade (Pole Mount)",
    coverage: "120m corridor along Hosur Rd",
    targetDrain: "BLR-SKB-101 / 102",
  },
  "CAM-02": {
    location: "Silk Board Central Underpass Nexus",
    ptz: "AZ 195° · EL -22° · 1.2x Optical",
    lens: "4.0mm F/1.4 Low-Light IR",
    elevation: "5.8m Pier Mount (Underpass Viaduct)",
    coverage: "110m underpass basin & median trench",
    targetDrain: "BLR-SKB-103 / 104",
  },
  "CAM-03": {
    location: "ORR / HSR Layout Ground Carriageway",
    ptz: "AZ 260° · EL -18° · 1.0x Optical",
    lens: "2.8mm F/1.6 Fixed Wide",
    elevation: "6.2m Curb Cantilever",
    coverage: "115m curb drain run & footpath",
    targetDrain: "BLR-SKB-105 / 106",
  },
};

function RainOverlayCanvas({ isRaining }: { isRaining: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isRaining) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const drops: Array<{ x: number; y: number; length: number; speed: number; opacity: number }> = [];
    const count = 45;

    for (let i = 0; i < count; i++) {
      drops.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        length: 8 + Math.random() * 14,
        speed: 12 + Math.random() * 8,
        opacity: 0.15 + Math.random() * 0.35,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(220, 240, 255, 0.4)";
      ctx.lineWidth = 1.2;

      for (const d of drops) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(220, 240, 255, ${d.opacity})`;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 3, d.y + d.length);
        ctx.stroke();

        d.y += d.speed;
        d.x -= 1.5;

        if (d.y > canvas.height) {
          d.y = -d.length;
          d.x = Math.random() * (canvas.width + 50);
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isRaining]);

  if (!isRaining) return null;

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={270}
      className="camera-rain-canvas"
    />
  );
}

function useLiveTimestamp(elapsedSeconds: number): string {
  const [msOffset, setMsOffset] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMsOffset((prev) => (prev + 137) % 1000);
    }, 150);
    return () => clearInterval(timer);
  }, []);

  const baseDate = useMemo(() => new Date(Date.now() + elapsedSeconds * 1000), [elapsedSeconds]);
  const dateStr = baseDate.toISOString().slice(0, 10);
  const timeStr = baseDate.toLocaleTimeString("en-GB", { hour12: false });
  const msStr = String(msOffset).padStart(3, "0").slice(0, 2);

  return `${dateStr} ${timeStr}.${msStr} IST`;
}

export function CameraFeedCanvas({
  cameraId,
  label,
  status,
  waterloggingConfidence,
  detectionActive,
  elapsedSeconds,
  nearbyFloodingSensors,
  showSpecs = false,
  rainfallMmHr = 0,
  compact = false,
}: {
  cameraId: string;
  label: string;
  status: "online" | "alert" | "offline";
  waterloggingConfidence: number;
  detectionActive: boolean;
  elapsedSeconds: number;
  nearbyFloodingSensors: number;
  showSpecs?: boolean;
  rainfallMmHr?: number;
  compact?: boolean;
}) {
  const isAlerting = detectionActive || status === "alert";
  const bgImage = getCameraImage(cameraId, isAlerting);
  const boxes = useMemo(
    () => (isAlerting ? getDetectionBoxes(cameraId, waterloggingConfidence) : []),
    [cameraId, isAlerting, waterloggingConfidence],
  );
  const liveTimestamp = useLiveTimestamp(elapsedSeconds);
  const specs = CAMERA_SPECS[cameraId] || CAMERA_SPECS["CAM-01"];
  const isRaining = isAlerting || rainfallMmHr > 10;

  return (
    <div className={`camera-feed-frame ${isAlerting ? "is-alert" : ""} ${status === "offline" ? "is-offline" : ""}`}>
      <div className="camera-viewport">
        {status === "offline" ? (
          <div className="camera-offline-slate">
            <h4>NO SIGNAL / RTSP STREAM TIMEOUT</h4>
            <p>{cameraId} · Sensor Gateway Disconnected</p>
            <span className="offline-sub">Agent Failover Re-routing Active</span>
          </div>
        ) : (
          <img
            src={bgImage}
            alt={`CCTV ${cameraId}: ${label}`}
            className="camera-video-bg"
            loading="eager"
          />
        )}

        {status !== "offline" && <RainOverlayCanvas isRaining={isRaining} />}

        <div className="camera-scanlines" />

        {status !== "offline" &&
          boxes.map((box) => (
            <div key={box.id} className={`camera-detection-box ${box.className}`} style={box.style}>
              <div className="detection-label-group">
                <span className="detection-label">{box.label}</span>
                {box.sublabel && <span className="detection-sublabel">{box.sublabel}</span>}
              </div>
              <div className="box-corner tl" />
              <div className="box-corner tr" />
              <div className="box-corner bl" />
              <div className="box-corner br" />
            </div>
          ))}

        <div className="camera-hud">
          <div className="camera-hud-top">
            <div className="camera-badge-group">
              <span className="camera-id-badge">{cameraId}</span>
              <span className={`camera-rec-badge ${status === "offline" ? "is-off" : ""}`}>
                {status === "offline" ? "OFFLINE" : "● REC"}
              </span>
              {!compact && (
                <>
                  <span className="camera-fps-tag">29.97 FPS</span>
                  <span className="camera-bitrate-tag">4.8 Mbps H.264</span>
                </>
              )}
            </div>

            <div className="camera-hud-top-right">
              <span className={`camera-status-badge status-${status}`}>
                <i /> {status.toUpperCase()}
              </span>
            </div>
          </div>

          {showSpecs && status !== "offline" && (
            <div className="camera-hud-specs">
              <span>{specs.ptz}</span>
              <span>{specs.lens}</span>
            </div>
          )}

          {!compact && (
            <div className="camera-hud-bottom">
              <span className="camera-timestamp">{liveTimestamp}</span>
              <span className="camera-label">{label}</span>
            </div>
          )}
        </div>

        {isAlerting && status !== "offline" && (
          <div className="camera-alert-banner">
            <strong>OPTICAL ANOMALY CONFIRMED</strong>, {nearbyFloodingSensors} sensor
            {nearbyFloodingSensors !== 1 ? "s" : ""} corroborating
          </div>
        )}
      </div>
    </div>
  );
}

export function CameraDetailModal({
  cameraId: initialCameraId,
  snapshot,
  latestDetection,
  onClose,
}: {
  cameraId: string;
  snapshot: SilkboardSnapshot;
  latestDetection: AgentDetection | null;
  onClose: () => void;
}) {
  const [selectedCamId, setSelectedCamId] = useState<string>(initialCameraId);
  const [showDispatch, setShowDispatch] = useState(false);
  const [snapshotCopied, setSnapshotCopied] = useState(false);

  const activeCamera = useMemo(
    () => CAMERAS.find((c) => c.id === selectedCamId) || CAMERAS[0],
    [selectedCamId],
  );
  const cameraState = useMemo(
    () => snapshot.cameras.find((c) => c.camera_id === selectedCamId) || {
      camera_id: selectedCamId,
      status: "online" as const,
      waterlogging_confidence: 12,
      detection_active: false,
    },
    [snapshot.cameras, selectedCamId],
  );

  const specs = CAMERA_SPECS[selectedCamId] || CAMERA_SPECS["CAM-01"];

  const nearbySensors = ROAD_SENSORS.filter((s) => {
    const dist = distance(s.position, activeCamera.position);
    return dist < activeCamera.coverage_radius / 100000;
  });

  const nearbyReadings = nearbySensors
    .map((s) => snapshot.road_sensors.find((r) => r.sensor_id === s.id))
    .filter(Boolean) as SilkboardRoadSensorReading[];

  const floodingCount = nearbyReadings.filter(
    (r) => r.status === "flooding" || r.status === "pooling",
  ).length;

  const handleCopySnapshot = () => {
    const url = `https://urbanflow.bbmp.gov.in${getCameraImage(selectedCamId, cameraState.detection_active)}`;
    navigator.clipboard.writeText(url);
    setSnapshotCopied(true);
    setTimeout(() => setSnapshotCopied(false), 2500);
  };

  return (
    <>
      <div className="camera-modal-backdrop" onClick={onClose}>
        <div className="camera-modal" onClick={(e) => e.stopPropagation()}>
          <header className="camera-modal-header">
            <div>
              <div className="camera-modal-title-row">
                <h3>{activeCamera.id}: {activeCamera.label}</h3>
              </div>
              <span className={`camera-status-inline status-${cameraState.status}`}>
                <i /> {cameraState.status.toUpperCase()}
                {cameraState.detection_active &&
                  `, ${cameraState.waterlogging_confidence}% optical waterlogging probability`}
              </span>
            </div>

            <button type="button" onClick={onClose} className="camera-modal-close" aria-label="Close modal">
              ✕
            </button>
          </header>

          <div className="camera-switcher-bar">
            {CAMERAS.map((cam) => {
              const cState = snapshot.cameras.find((c) => c.camera_id === cam.id);
              const isActive = cam.id === selectedCamId;
              const isAlert = cState?.status === "alert" || cState?.detection_active;
              return (
                <button
                  key={cam.id}
                  type="button"
                  className={`camera-switch-btn ${isActive ? "is-active" : ""} ${isAlert ? "is-alert" : ""}`}
                  onClick={() => setSelectedCamId(cam.id)}
                >
                  <span className="switch-cam-id">{cam.id}</span>
                  <span className="switch-cam-label">{cam.label.split("—")[0].trim()}</span>
                  {isAlert && <span className="switch-alert-dot" title="Active Anomaly Detected" />}
                </button>
              );
            })}
          </div>

          <div className="camera-modal-body">
            <div className="camera-modal-feed-container">
              <CameraFeedCanvas
                cameraId={activeCamera.id}
                label={activeCamera.label}
                status={cameraState.status}
                waterloggingConfidence={cameraState.waterlogging_confidence}
                detectionActive={cameraState.detection_active}
                elapsedSeconds={snapshot.config.elapsed_seconds}
                nearbyFloodingSensors={floodingCount}
                showSpecs={true}
                rainfallMmHr={snapshot.config.rainfall_mm_hr}
              />

              <div className="camera-hardware-card">
                <div className="hw-meta-item">
                  <span className="hw-label">Optics</span>
                  <strong>{specs.lens}</strong>
                </div>
                <div className="hw-meta-item">
                  <span className="hw-label">Orientation</span>
                  <strong>{specs.ptz}</strong>
                </div>
                <div className="hw-meta-item">
                  <span className="hw-label">Mount</span>
                  <strong>{specs.elevation}</strong>
                </div>
                <div className="hw-meta-item">
                  <span className="hw-label">Monitored Drain</span>
                  <strong>{specs.targetDrain}</strong>
                </div>
              </div>
            </div>

            <div className="camera-modal-info">
              <div className="camera-info-section optical-analytics-card">
                <h4>AI Optical Triage & Segmentation</h4>
                
                {cameraState.detection_active ? (
                  <div className="optical-metrics-grid">
                    <div className="optical-metric">
                      <span className="opt-label">Identified Debris Class</span>
                      <strong className="opt-val is-choke">
                        {selectedCamId === "CAM-03" ? "Construction Rubble + Silt" : "Surface Water Surcharge"}
                      </strong>
                    </div>

                    <div className="optical-metric">
                      <span className="opt-label">Estimated Choke Ratio</span>
                      <strong className="opt-val">
                        {selectedCamId === "CAM-03" ? "88% Grate Blocked" : "40cm Underpass Inundation"}
                      </strong>
                    </div>

                    <div className="optical-metric full-width">
                      <span className="opt-label">Multi-Class Material Breakdown</span>
                      <div className="material-bars">
                        <div className="mat-bar-row">
                          <span>Concrete / Rubble</span>
                          <div className="bar-track"><div className="bar-fill" style={{ width: "94%" }} /></div>
                          <strong>94%</strong>
                        </div>
                        <div className="mat-bar-row">
                          <span>Sediment & Silt</span>
                          <div className="bar-track"><div className="bar-fill" style={{ width: "88%" }} /></div>
                          <strong>88%</strong>
                        </div>
                        <div className="mat-bar-row">
                          <span>Plastic Debris</span>
                          <div className="bar-track"><div className="bar-fill" style={{ width: "76%" }} /></div>
                          <strong>76%</strong>
                        </div>
                      </div>
                    </div>

                    <div className="optical-action-row">
                      <button
                        type="button"
                        className="btn-snapshot-action"
                        onClick={handleCopySnapshot}
                      >
                        {snapshotCopied ? "Frame URL Copied" : "Copy CCTV Evidence Frame"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="camera-clear-note">
                    <p>No visual obstructions detected. Drain grates and roadway corridors are optically clear.</p>
                  </div>
                )}
              </div>

              <div className="camera-info-section">
                <h4>Surface Sensors in Camera Field of View</h4>
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

              <div className="camera-info-section">
                <ObjectScan
                  imageSrc={getCameraImage(selectedCamId, cameraState.detection_active)}
                  cameraId={selectedCamId}
                  surfaceReadings={nearbyReadings}
                />
              </div>

              {latestDetection && (
                <div className="camera-info-section">
                  <h4>Field Crew Escalation</h4>
                  <button
                    type="button"
                    className="btn-open-dispatch"
                    onClick={() => setShowDispatch(true)}
                  >
                    Open WhatsApp Field Dispatch Template ({activeCamera.id})
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDispatch && latestDetection && (
        <DispatchModal
          detection={{
            ...latestDetection,
            visual_result: {
              camera_id: selectedCamId,
              debris_class: selectedCamId === "CAM-03" ? "construction_debris" : "plastic",
              confidence: cameraState.waterlogging_confidence,
              frame_index: 0,
            },
          }}
          onClose={() => setShowDispatch(false)}
        />
      )}
    </>
  );
}

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
      <span className="camera-strip-label">Live CCTV Corridor Feeds</span>
      <div className="camera-strip-row">
        {CAMERAS.map((camera) => {
          const state = snapshot.cameras.find((c) => c.camera_id === camera.id);
          const status = state?.status ?? "online";

          const nearbySensors = ROAD_SENSORS.filter((s) => {
            const dist = distance(s.position, camera.position);
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
              className={`camera-thumb ${status === "alert" ? "is-alert" : ""} ${status === "offline" ? "is-offline" : ""}`}
              onClick={() => onSelectCamera(camera.id)}
              title={`Click to inspect live high-resolution ${camera.id} optical feed`}
            >
              <CameraFeedCanvas
                cameraId={camera.id}
                label={camera.label}
                status={status}
                waterloggingConfidence={state?.waterlogging_confidence ?? 0}
                detectionActive={state?.detection_active ?? false}
                elapsedSeconds={snapshot.config.elapsed_seconds}
                nearbyFloodingSensors={floodingCount}
                rainfallMmHr={snapshot.config.rainfall_mm_hr}
                compact
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
