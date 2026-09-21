import { useEffect, useMemo } from "react";
import type { PathOptions, Layer, LatLngExpression } from "leaflet";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Polyline,
  Polygon,
  Tooltip,
  useMap,
  Popup,
} from "react-leaflet";
import {
  CAMERAS,
  DRAIN_INLETS,
  DRAIN_NODES,
  FLYOVER_STRUCTURES,
  PERIPHERAL_DRAINS,
  ROAD_SENSORS,
  SILKBOARD_BOUNDS,
  SILKBOARD_CENTER,
  SILKBOARD_ZOOM,
} from "../../data/silkboard";
import type {
  SilkboardSnapshot,
  SilkboardDrainTelemetry,
  SilkboardRoadSensorReading,
  SilkboardInletReading,
  SilkboardCameraState,
  AgentDetection,
  Coordinate,
} from "../../types";

// ─── Color maps ─────────────────────────────────────────────────────────────

const RISK_COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
};

const ROAD_SENSOR_COLORS = {
  dry: "#94a3b8",
  damp: "#60a5fa",
  pooling: "#f59e0b",
  flooding: "#ef4444",
};

const INLET_STATUS_COLORS = {
  normal: "#ef4444",
  surging: "#f97316",
  backflow: "#a855f7",
  blocked: "#6b7280",
};

const CAMERA_STATUS_COLORS = {
  online: "#22c55e",
  alert: "#ef4444",
  offline: "#6b7280",
};

// ─── Map controller ─────────────────────────────────────────────────────────

function SilkboardMapController() {
  const map = useMap();
  useEffect(() => {
    map.setView(
      [SILKBOARD_CENTER[1], SILKBOARD_CENTER[0]],
      SILKBOARD_ZOOM,
    );
  }, [map]);
  return null;
}

// ─── FOV cone for cameras ───────────────────────────────────────────────────

function CameraFOV({
  position,
  bearing,
  coverageAngle,
  coverageRadius,
  status,
}: {
  position: Coordinate;
  bearing: number;
  coverageAngle: number;
  coverageRadius: number;
  status: "online" | "alert" | "offline";
}) {
  const points = useMemo(() => {
    const center: [number, number] = [position[1], position[0]];
    const radiusDeg = coverageRadius / 111000;
    const startAngle = bearing - coverageAngle / 2;
    const endAngle = bearing + coverageAngle / 2;
    const pts: [number, number][] = [center];

    for (let a = startAngle; a <= endAngle; a += 5) {
      const rad = (a * Math.PI) / 180;
      pts.push([
        center[0] + radiusDeg * Math.cos(rad),
        center[1] + radiusDeg * Math.sin(rad),
      ]);
    }
    pts.push(center);
    return pts;
  }, [position, bearing, coverageAngle, coverageRadius]);

  const color = CAMERA_STATUS_COLORS[status];
  return (
    <Polygon
      positions={points}
      pathOptions={{
        color,
        fillColor: color,
        fillOpacity: status === "alert" ? 0.18 : 0.08,
        weight: 1,
        opacity: 0.4,
        dashArray: "4 4",
      }}
    />
  );
}

// ─── Waterlogging heatmap zones ─────────────────────────────────────────────

function WaterloggingZones({
  roadSensors,
  tick,
}: {
  roadSensors: SilkboardRoadSensorReading[];
  tick: number;
}) {
  const zones = useMemo(() => {
    const floodingSensors = roadSensors.filter(
      (s) => s.status === "flooding" || s.status === "pooling",
    );

    return floodingSensors.map((reading) => {
      const sensor = ROAD_SENSORS.find((s) => s.id === reading.sensor_id);
      if (!sensor) return null;
      const radius = reading.status === "flooding" ? 0.00035 : 0.00020;
      const center = sensor.position;

      // Create a rough circle as polygon points
      const points: [number, number][] = [];
      for (let a = 0; a < 360; a += 30) {
        const rad = (a * Math.PI) / 180;
        const jitter = 0.7 + Math.sin(a * 3 + tick * 0.5) * 0.3;
        points.push([
          center[1] + radius * Math.cos(rad) * jitter,
          center[0] + radius * Math.sin(rad) * jitter,
        ]);
      }
      return { points, status: reading.status, sensorId: reading.sensor_id };
    }).filter(Boolean) as Array<{
      points: [number, number][];
      status: string;
      sensorId: string;
    }>;
  }, [roadSensors, tick]);

  return (
    <>
      {zones.map((zone) => (
        <Polygon
          key={zone.sensorId}
          positions={zone.points}
          pathOptions={{
            color: zone.status === "flooding" ? "#ef444480" : "#f59e0b60",
            fillColor: zone.status === "flooding" ? "#ef4444" : "#f59e0b",
            fillOpacity: zone.status === "flooding" ? 0.3 : 0.18,
            weight: 0,
          }}
        />
      ))}
    </>
  );
}

// ─── Agent annotation callouts ──────────────────────────────────────────────

function AgentAnnotations({
  detections,
  onSelectDetection,
}: {
  detections: AgentDetection[];
  onSelectDetection: (d: AgentDetection) => void;
}) {
  // Show only the most recent detection per drain
  const latestByDrain = useMemo(() => {
    const map = new Map<string, AgentDetection>();
    for (const d of detections) {
      if (!map.has(d.drain_id) || d.timestamp > map.get(d.drain_id)!.timestamp) {
        map.set(d.drain_id, d);
      }
    }
    return Array.from(map.values()).filter(
      (d) => d.classification !== "normal_runoff",
    );
  }, [detections]);

  return (
    <>
      {latestByDrain.map((detection) => {
        const node = DRAIN_NODES.find((n) => n.drain_id === detection.drain_id);
        if (!node) return null;

        const label =
          detection.classification === "confirmed_blockage"
            ? "BLOCKAGE CONFIRMED"
            : detection.classification === "probable_blockage"
              ? "PROBABLE BLOCKAGE"
              : "ANOMALY DETECTED";

        return (
          <CircleMarker
            key={detection.id}
            center={[node.position[1], node.position[0]]}
            radius={18}
            pathOptions={{
              color: detection.risk_level === "red" ? "#ef4444" : "#f59e0b",
              fillColor: detection.risk_level === "red" ? "#ef444430" : "#f59e0b30",
              fillOpacity: 0.5,
              weight: 2,
              dashArray: "5 3",
            }}
            eventHandlers={{ click: () => onSelectDetection(detection) }}
          >
            <Tooltip permanent direction="top" offset={[0, -20]} className="agent-annotation-tooltip">
              <div className="silkboard-annotation">
                <strong>{label}</strong>
                <span>{detection.drain_id} — {detection.blockage_probability}%</span>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function SilkboardMapView({
  snapshot,
  selectedDrainId,
  selectedDetection,
  onSelectDrain,
  onSelectCamera,
  onSelectDetection,
}: {
  snapshot: SilkboardSnapshot | null;
  selectedDrainId: string | null;
  selectedDetection: AgentDetection | null;
  onSelectDrain: (id: string) => void;
  onSelectCamera: (id: string) => void;
  onSelectDetection: (d: AgentDetection) => void;
}) {
  const tick = snapshot?.tick ?? 0;

  const drainTelemetryMap = useMemo(() => {
    const map = new Map<string, SilkboardDrainTelemetry>();
    for (const d of snapshot?.drains ?? []) map.set(d.drain_id, d);
    return map;
  }, [snapshot?.drains]);

  const roadSensorMap = useMemo(() => {
    const map = new Map<string, SilkboardRoadSensorReading>();
    for (const s of snapshot?.road_sensors ?? []) map.set(s.sensor_id, s);
    return map;
  }, [snapshot?.road_sensors]);

  const inletMap = useMemo(() => {
    const map = new Map<string, SilkboardInletReading>();
    for (const i of snapshot?.inlets ?? []) map.set(i.inlet_id, i);
    return map;
  }, [snapshot?.inlets]);

  const cameraMap = useMemo(() => {
    const map = new Map<string, SilkboardCameraState>();
    for (const c of snapshot?.cameras ?? []) map.set(c.camera_id, c);
    return map;
  }, [snapshot?.cameras]);

  return (
    <MapContainer
      center={[SILKBOARD_CENTER[1], SILKBOARD_CENTER[0]]}
      zoom={SILKBOARD_ZOOM}
      minZoom={14}
      maxZoom={19}
      preferCanvas
      zoomControl
      className="silkboard-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <SilkboardMapController />

      {/* Elevated Flyover Structures (Level 1 & 2 decks from flyover.geojson) */}
      {FLYOVER_STRUCTURES.map((flyover) => (
        <Polyline
          key={flyover.id}
          positions={flyover.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])}
          pathOptions={{
            color: flyover.layer === 2 ? "#64748b" : "#475569",
            weight: flyover.layer === 2 ? 6 : 5,
            opacity: 0.65,
            dashArray: flyover.layer === 2 ? "12 4" : undefined,
          }}
        >
          <Tooltip sticky>
            <div className="silkboard-tooltip">
              <strong>🌉 {flyover.name}</strong>
              <span>Elevated Deck — Level {flyover.layer} ({flyover.bridge})</span>
              <span>Ground-level peripheral drains run along the roadway beneath</span>
            </div>
          </Tooltip>
        </Polyline>
      ))}

      {/* Peripheral drains (along actual flyover ground roads) */}
      {PERIPHERAL_DRAINS.map((drain) => (
        <Polyline
          key={drain.id}
          positions={drain.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])}
          pathOptions={{
            color: "#1d4ed8",
            weight: 3.5,
            opacity: 0.9,
            dashArray: "8 4",
          }}
        >
          <Tooltip sticky>
            <div className="silkboard-tooltip">
              <strong>🌊 {drain.name || drain.id}</strong>
              <span>Ground Peripheral Drain — {drain.capacity_liters_per_sec} L/s capacity</span>
              <span>Connected to City Network: {drain.connected_city_drain_id}</span>
            </div>
          </Tooltip>
        </Polyline>
      ))}

      {/* Drain inlets (red dots) */}
      {DRAIN_INLETS.map((inlet) => {
        const reading = inletMap.get(inlet.id);
        const status = reading?.status ?? "normal";
        const color = INLET_STATUS_COLORS[status];
        const isBackflow = reading?.flow_direction === "backflow";

        return (
          <CircleMarker
            key={inlet.id}
            center={[inlet.position[1], inlet.position[0]]}
            radius={isBackflow ? 7 : 5}
            pathOptions={{
              color: isBackflow ? "#a855f7" : color,
              fillColor: color,
              fillOpacity: 0.9,
              weight: isBackflow ? 2.5 : 1.5,
            }}
          >
            <Tooltip sticky>
              <div className="silkboard-tooltip">
                <strong>{inlet.id}</strong>
                <span>{inlet.type.replace("_", " ")} — {status}</span>
                {reading && (
                  <span>
                    Flow: {reading.flow_direction} at {reading.flow_rate_lps.toFixed(1)} L/s
                  </span>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* Drain nodes (larger markers with telemetry) */}
      {DRAIN_NODES.map((node) => {
        const telemetry = drainTelemetryMap.get(node.drain_id);
        const status = telemetry?.status ?? "green";
        const color = RISK_COLORS[status];
        const isSelected = selectedDrainId === node.drain_id;

        return (
          <CircleMarker
            key={node.drain_id}
            center={[node.position[1], node.position[0]]}
            radius={isSelected ? 14 : 10}
            pathOptions={{
              color: isSelected ? "#ffffff" : color,
              fillColor: color,
              fillOpacity: 0.85,
              weight: isSelected ? 3 : 2,
            }}
            eventHandlers={{ click: () => onSelectDrain(node.drain_id) }}
          >
            <Tooltip sticky direction="top">
              <div className="silkboard-tooltip">
                <strong>{node.drain_id}</strong>
                <span>{node.label}</span>
                {telemetry && (
                  <>
                    <span className={`tooltip-status status-${status}`}>
                      {status.toUpperCase()} — Water: {telemetry.telemetry.water_level_cm.toFixed(0)} cm
                    </span>
                    <span>
                      Flow: {telemetry.telemetry.flow_velocity_mps.toFixed(2)} m/s |
                      Rain: {telemetry.weather.precip_rate_mm_hr.toFixed(1)} mm/hr
                    </span>
                  </>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* Road sensors (small dots) */}
      {ROAD_SENSORS.map((sensor) => {
        const reading = roadSensorMap.get(sensor.id);
        const status = reading?.status ?? "dry";
        const color = ROAD_SENSOR_COLORS[status];
        const isPulsing = status === "flooding" || status === "pooling";

        return (
          <CircleMarker
            key={sensor.id}
            center={[sensor.position[1], sensor.position[0]]}
            radius={isPulsing ? 5 : 3.5}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: isPulsing ? 0.95 : 0.7,
              weight: isPulsing ? 1.5 : 1,
              className: isPulsing ? "sensor-pulse" : undefined,
            }}
          >
            <Tooltip sticky>
              <div className="silkboard-tooltip">
                <strong>{sensor.id}</strong>
                <span>{sensor.type.replace("_", " ")} sensor — {status}</span>
                {reading && (
                  <span>Water depth: {reading.water_depth_cm.toFixed(1)} cm</span>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* CCTV cameras */}
      {CAMERAS.map((camera) => {
        const state = cameraMap.get(camera.id);
        const camStatus = state?.status ?? "online";

        return (
          <span key={camera.id}>
            <CameraFOV
              position={camera.position}
              bearing={camera.bearing}
              coverageAngle={camera.coverage_angle}
              coverageRadius={camera.coverage_radius}
              status={camStatus}
            />
            <CircleMarker
              center={[camera.position[1], camera.position[0]]}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                fillColor: CAMERA_STATUS_COLORS[camStatus],
                fillOpacity: 0.95,
                weight: 2.5,
              }}
              eventHandlers={{ click: () => onSelectCamera(camera.id) }}
            >
              <Tooltip sticky direction="top">
                <div className="silkboard-tooltip">
                  <strong>📹 {camera.id}</strong>
                  <span>{camera.label}</span>
                  <span className={`tooltip-status status-${camStatus === "alert" ? "red" : "green"}`}>
                    {camStatus.toUpperCase()}
                    {state?.detection_active && ` — ${state.waterlogging_confidence}% confidence`}
                  </span>
                </div>
              </Tooltip>
            </CircleMarker>
          </span>
        );
      })}

      {/* Waterlogging heatmap zones */}
      <WaterloggingZones
        roadSensors={snapshot?.road_sensors ?? []}
        tick={tick}
      />

      {/* Agent annotation callouts */}
      <AgentAnnotations
        detections={snapshot?.detections ?? []}
        onSelectDetection={onSelectDetection}
      />

      {/* Map legend */}
      <div className="silkboard-map-legend">
        <p><strong>Silk Board Junction Network</strong></p>
        <div className="legend-section">
          <span><i style={{ background: "#475569", height: 4, width: 14 }} /> Flyover Deck (L1/L2)</span>
          <span><i style={{ background: "#1d4ed8", height: 3, width: 14 }} /> Ground Drain</span>
          <span><i style={{ background: "#ef4444", borderRadius: "50%" }} /> Drain Inlet</span>
          <span><i style={{ background: "#22c55e", borderRadius: "50%" }} /> Drain Node Hub</span>
        </div>
        <div className="legend-section">
          <span><i style={{ background: "#94a3b8", borderRadius: "50%", width: 6, height: 6 }} /> Dry</span>
          <span><i style={{ background: "#60a5fa", borderRadius: "50%", width: 6, height: 6 }} /> Damp</span>
          <span><i style={{ background: "#f59e0b", borderRadius: "50%", width: 6, height: 6 }} /> Pooling</span>
          <span><i style={{ background: "#ef4444", borderRadius: "50%", width: 6, height: 6 }} /> Flooding</span>
        </div>
        <div className="legend-section">
          <span>📹 Intersection CCTV Camera</span>
        </div>
      </div>
    </MapContainer>
  );
}
