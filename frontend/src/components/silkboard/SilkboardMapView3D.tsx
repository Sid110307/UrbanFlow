import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import MapGL, { Layer, Marker, useControl } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import type { MapLibreOverlayProps } from "@deck.gl/maplibre";
import { LightingEffect, AmbientLight, DirectionalLight } from "@deck.gl/core";
import type { PickingInfo } from "@deck.gl/core";
import { PathLayer, ScatterplotLayer, PolygonLayer, ColumnLayer } from "@deck.gl/layers";
import {
  CAMERAS,
  DRAIN_INLETS,
  DRAIN_NODES,
  FLYOVER_STRUCTURES,
  PERIPHERAL_DRAINS,
  ROAD_SENSORS,
  SILKBOARD_BOUNDS,
  SILKBOARD_CENTER,
} from "../../silkboard";
import type {
  SilkboardSnapshot,
  SilkboardDrainTelemetry,
  SilkboardRoadSensorReading,
  SilkboardInletReading,
  SilkboardCameraState,
  AgentDetection,
  Coordinate,
  SilkboardFloodHistoryPoint,
  SilkboardRealDrainDataset,
} from "../../types";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DEFAULT_PITCH = 55;
const DEFAULT_BEARING = -18;

const RISK_COLORS: Record<string, [number, number, number]> = {
  green: [34, 197, 94],
  yellow: [245, 158, 11],
  red: [239, 68, 68],
};
const RISK_HEIGHT: Record<string, number> = { green: 6, yellow: 22, red: 44 };

const ROAD_SENSOR_COLORS: Record<string, [number, number, number]> = {
  dry: [148, 163, 184],
  damp: [96, 165, 250],
  pooling: [245, 158, 11],
  flooding: [239, 68, 68],
};

const INLET_STATUS_COLORS: Record<string, [number, number, number]> = {
  normal: [239, 68, 68],
  surging: [249, 115, 22],
  backflow: [168, 85, 247],
  blocked: [107, 114, 128],
};

const CAMERA_STATUS_COLORS: Record<string, [number, number, number]> = {
  online: [34, 197, 94],
  alert: [239, 68, 68],
  offline: [107, 114, 128],
};

const lightingEffect = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.4 }),
  main: new DirectionalLight({ color: [255, 255, 255], intensity: 1.5, direction: [-2, -3, -1] }),
});

function boundsToLngLat(bounds: [number, number, number, number]): [[number, number], [number, number]] {
  return [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[3]],
  ];
}

function cameraFovPolygon(
  position: Coordinate,
  bearing: number,
  coverageAngle: number,
  coverageRadius: number,
): [number, number][] {
  const center: [number, number] = [position[0], position[1]];
  const radiusDeg = coverageRadius / 111000;
  const startAngle = bearing - coverageAngle / 2;
  const endAngle = bearing + coverageAngle / 2;
  const pts: [number, number][] = [center];
  for (let a = startAngle; a <= endAngle; a += 5) {
    const rad = (a * Math.PI) / 180;
    pts.push([center[0] + radiusDeg * Math.sin(rad), center[1] + radiusDeg * Math.cos(rad)]);
  }
  pts.push(center);
  return pts;
}

function DeckGLOverlay(props: MapLibreOverlayProps) {
  const overlay = useControl<MapLibreOverlay>(() => new MapLibreOverlay(props));
  overlay.setProps(props);
  return null;
}

type TooltipDatum = { _kind: string; html: string };

export function SilkboardMapView3D({
  snapshot,
  selectedDrainId,
  selectedDetection: _selectedDetection,
  onSelectDrain,
  onSelectCamera,
  onSelectDetection,
  floodHistory,
  realDrains,
}: {
  snapshot: SilkboardSnapshot | null;
  selectedDrainId: string | null;
  selectedDetection: AgentDetection | null;
  onSelectDrain: (id: string) => void;
  onSelectCamera: (id: string) => void;
  onSelectDetection: (d: AgentDetection) => void;
  floodHistory?: SilkboardFloodHistoryPoint[];
  realDrains?: SilkboardRealDrainDataset | null;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const tick = snapshot?.tick ?? 0;
  const [legendOpen, setLegendOpen] = useState(true);
  const [is3D, setIs3D] = useState(true);
  const [labelLayerId, setLabelLayerId] = useState<string | undefined>(undefined);
  const hasInitializedRef = useRef(false);

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

  const handleStyleData = useCallback((event: { target: MapLibreMap }) => {
    if (hasInitializedRef.current) return;
    const map = event.target;
    if (!map.isStyleLoaded()) return;
    hasInitializedRef.current = true;
    const style = map.getStyle();
    const labelLayer = style?.layers?.find(
      (layer) => layer.type === "symbol" && layer.layout && "text-field" in layer.layout,
    );
    setLabelLayerId(labelLayer?.id);
    map.fitBounds(boundsToLngLat(SILKBOARD_BOUNDS), {
      padding: 40,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      duration: 0,
    });
  }, []);

  const handleFit = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.fitBounds(boundsToLngLat(SILKBOARD_BOUNDS), {
      padding: 40,
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      duration: 500,
    });
  }, []);

  const handleToggleDimension = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    setIs3D((prev) => {
      const next = !prev;
      map.easeTo({ pitch: next ? DEFAULT_PITCH : 0, bearing: next ? DEFAULT_BEARING : 0, duration: 450 });
      if (next) map.dragRotate.enable();
      else map.dragRotate.disable();
      return next;
    });
  }, []);

  const layers = useMemo(() => {
    const flyoverLayer = new PathLayer({
      id: "flyovers",
      data: FLYOVER_STRUCTURES,
      getPath: (d) => d.coordinates,
      getColor: (d) => (d.layer === 2 ? [100, 116, 139, 200] : [71, 85, 105, 200]),
      getWidth: (d) => (d.layer === 2 ? 6 : 5),
      widthUnits: "pixels",
      widthMinPixels: 3,
      jointRounded: true,
      capRounded: true,
      pickable: true,
    });

    const peripheralLayer = new PathLayer({
      id: "peripheral-drains",
      data: PERIPHERAL_DRAINS,
      getPath: (d) => d.coordinates,
      getColor: [29, 78, 216, 220],
      getWidth: 3,
      widthUnits: "pixels",
      widthMinPixels: 2,
      jointRounded: true,
      capRounded: true,
      pickable: true,
    });

    const realDrainLayer = realDrains
      ? new PathLayer({
          id: "real-drains",
          data: realDrains.features.flatMap((f) => {
            const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
            return lines.map((path) => ({ path, label: f.properties.label }));
          }),
          getPath: (d) => d.path,
          getColor: [148, 163, 184, 160],
          getWidth: 2,
          widthUnits: "pixels",
          widthMinPixels: 1,
          pickable: true,
        })
      : null;

    const inletLayer = new ScatterplotLayer({
      id: "inlets",
      data: DRAIN_INLETS,
      getPosition: (d) => d.position,
      getRadius: (d) => {
        const reading = inletMap.get(d.id);
        return reading?.flow_direction === "backflow" ? 5.5 : 4;
      },
      getFillColor: (d) => {
        const reading = inletMap.get(d.id);
        return INLET_STATUS_COLORS[reading?.status ?? "normal"];
      },
      radiusUnits: "pixels",
      pickable: true,
      updateTriggers: { getFillColor: [inletMap], getRadius: [inletMap] },
    });

    const drainNodeLayer = new ColumnLayer({
      id: "drain-nodes",
      data: DRAIN_NODES,
      diskResolution: 16,
      radius: 9,
      getPosition: (d) => d.position,
      getFillColor: (d) => RISK_COLORS[drainTelemetryMap.get(d.drain_id)?.status ?? "green"],
      getLineColor: (d) => (selectedDrainId === d.drain_id ? [255, 255, 255, 255] : [23, 48, 44, 120]),
      getElevation: (d) => RISK_HEIGHT[drainTelemetryMap.get(d.drain_id)?.status ?? "green"],
      getLineWidth: (d) => (selectedDrainId === d.drain_id ? 3 : 1),
      lineWidthUnits: "pixels",
      extruded: true,
      pickable: true,
      onClick: (info) => {
        const d = info.object as (typeof DRAIN_NODES)[number] | undefined;
        if (d) onSelectDrain(d.drain_id);
      },
      updateTriggers: {
        getFillColor: [drainTelemetryMap, tick],
        getElevation: [drainTelemetryMap, tick],
        getLineColor: [selectedDrainId],
        getLineWidth: [selectedDrainId],
      },
    });

    const sensorLayer = new ScatterplotLayer({
      id: "road-sensors",
      data: ROAD_SENSORS,
      getPosition: (d) => d.position,
      getRadius: (d) => {
        const status = roadSensorMap.get(d.id)?.status ?? "dry";
        return status === "flooding" || status === "pooling" ? 5 : 3.5;
      },
      getFillColor: (d) => ROAD_SENSOR_COLORS[roadSensorMap.get(d.id)?.status ?? "dry"],
      radiusUnits: "pixels",
      pickable: true,
      updateTriggers: { getFillColor: [roadSensorMap, tick], getRadius: [roadSensorMap, tick] },
    });

    const cameraFovLayer = new PolygonLayer({
      id: "camera-fov",
      data: CAMERAS,
      getPolygon: (d) => cameraFovPolygon(d.position, d.bearing, d.coverage_angle, d.coverage_radius),
      getFillColor: (d) => {
        const status = cameraMap.get(d.id)?.status ?? "online";
        const [r, g, b] = CAMERA_STATUS_COLORS[status];
        return [r, g, b, status === "alert" ? 46 : 20];
      },
      getLineColor: (d) => {
        const status = cameraMap.get(d.id)?.status ?? "online";
        return [...CAMERA_STATUS_COLORS[status], 100] as [number, number, number, number];
      },
      lineWidthMinPixels: 1,
      stroked: true,
      filled: true,
      updateTriggers: { getFillColor: [cameraMap], getLineColor: [cameraMap] },
    });

    const cameraLayer = new ScatterplotLayer({
      id: "cameras",
      data: CAMERAS,
      getPosition: (d) => d.position,
      getRadius: 7,
      getFillColor: (d) => CAMERA_STATUS_COLORS[cameraMap.get(d.id)?.status ?? "online"],
      getLineColor: [255, 255, 255],
      lineWidthMinPixels: 2,
      stroked: true,
      radiusUnits: "pixels",
      pickable: true,
      onClick: (info) => {
        const d = info.object as (typeof CAMERAS)[number] | undefined;
        if (d) onSelectCamera(d.id);
      },
      updateTriggers: { getFillColor: [cameraMap] },
    });

    const floodZones = (snapshot?.road_sensors ?? [])
      .filter((s) => s.status === "flooding" || s.status === "pooling")
      .map((reading) => {
        const sensor = ROAD_SENSORS.find((s) => s.id === reading.sensor_id);
        if (!sensor) return null;
        const radius = reading.status === "flooding" ? 0.00035 : 0.0002;
        const points: [number, number][] = [];
        for (let a = 0; a < 360; a += 30) {
          const rad = (a * Math.PI) / 180;
          const jitter = 0.7 + Math.sin(a * 3 + tick * 0.5) * 0.3;
          points.push([sensor.position[0] + radius * Math.cos(rad) * jitter, sensor.position[1] + radius * Math.sin(rad) * jitter]);
        }
        return { polygon: points, status: reading.status };
      })
      .filter(Boolean) as Array<{ polygon: [number, number][]; status: string }>;

    const floodZoneLayer =
      floodZones.length > 0
        ? new PolygonLayer({
            id: "flood-zones",
            data: floodZones,
            getPolygon: (d) => d.polygon,
            getFillColor: (d) => (d.status === "flooding" ? [239, 68, 68, 76] : [245, 158, 11, 46]),
            stroked: false,
          })
        : null;

    const floodHistoryLayer = floodHistory
      ? new ScatterplotLayer({
          id: "flood-history",
          data: floodHistory,
          getPosition: (d) => d.position,
          getRadius: 6,
          getFillColor: [245, 158, 11, 90],
          getLineColor: [245, 158, 11],
          lineWidthMinPixels: 2,
          stroked: true,
          radiusUnits: "pixels",
          pickable: true,
        })
      : null;

    return [
      flyoverLayer,
      peripheralLayer,
      realDrainLayer,
      floodZoneLayer,
      cameraFovLayer,
      inletLayer,
      sensorLayer,
      drainNodeLayer,
      cameraLayer,
      floodHistoryLayer,
    ].filter(Boolean);
  }, [
    cameraMap,
    drainTelemetryMap,
    floodHistory,
    inletMap,
    onSelectCamera,
    onSelectDrain,
    realDrains,
    roadSensorMap,
    selectedDrainId,
    snapshot?.road_sensors,
    tick,
  ]);

  const getTooltip = useCallback(
    (info: PickingInfo) => {
      if (!info.object) return null;
      switch (info.layer?.id) {
        case "drain-nodes": {
          const d = info.object as (typeof DRAIN_NODES)[number];
          const telemetry = drainTelemetryMap.get(d.drain_id);
          return {
            html: `<strong>${d.drain_id}</strong><span>${d.label}</span>${
              telemetry
                ? `<span>${telemetry.status.toUpperCase()}, water: ${telemetry.telemetry.water_level_cm.toFixed(0)} cm</span>`
                : ""
            }`,
            className: "silkboard-tooltip",
          };
        }
        case "cameras": {
          const d = info.object as (typeof CAMERAS)[number];
          const state = cameraMap.get(d.id);
          return {
            html: `<strong>${d.id}</strong><span>${d.label}</span><span>${(state?.status ?? "online").toUpperCase()}</span>`,
            className: "silkboard-tooltip",
          };
        }
        case "road-sensors": {
          const d = info.object as (typeof ROAD_SENSORS)[number];
          const reading = roadSensorMap.get(d.id);
          return {
            html: `<strong>${d.id}</strong><span>${(reading?.status ?? "dry")} surface</span>`,
            className: "silkboard-tooltip",
          };
        }
        case "inlets": {
          const d = info.object as (typeof DRAIN_INLETS)[number];
          const reading = inletMap.get(d.id);
          return {
            html: `<strong>${d.id}</strong><span>${reading?.status ?? "normal"}</span>`,
            className: "silkboard-tooltip",
          };
        }
        case "flyovers": {
          const d = info.object as (typeof FLYOVER_STRUCTURES)[number];
          return { html: `<strong>${d.name}</strong><span>Elevated Deck, Level ${d.layer}</span>`, className: "silkboard-tooltip" };
        }
        case "peripheral-drains": {
          const d = info.object as (typeof PERIPHERAL_DRAINS)[number];
          return { html: `<strong>${d.name || d.id}</strong><span>Ground Peripheral Drain</span>`, className: "silkboard-tooltip" };
        }
        case "flood-history": {
          const d = info.object as SilkboardFloodHistoryPoint;
          return { html: `<strong>${d.name}</strong><span>BBMP-flagged flood-vulnerable location</span>`, className: "silkboard-tooltip" };
        }
        default:
          return null;
      }
    },
    [cameraMap, drainTelemetryMap, inletMap, roadSensorMap],
  );

  const latestAnnotations = useMemo(() => {
    const map = new Map<string, AgentDetection>();
    for (const d of snapshot?.detections ?? []) {
      if (!map.has(d.drain_id) || d.timestamp > map.get(d.drain_id)!.timestamp) map.set(d.drain_id, d);
    }
    return Array.from(map.values()).filter((d) => d.classification !== "normal_runoff");
  }, [snapshot?.detections]);

  return (
    <div className="network-map silkboard-map-3d" onContextMenu={(e) => e.preventDefault()}>
      <MapGL
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={{
          longitude: SILKBOARD_CENTER[0],
          latitude: SILKBOARD_CENTER[1],
          zoom: 16,
          pitch: DEFAULT_PITCH,
          bearing: DEFAULT_BEARING,
        }}
        onStyleData={handleStyleData}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" }}
      >
        {labelLayerId && (
          <Layer
            id="silkboard-3d-buildings"
            type="fill-extrusion"
            source="openmaptiles"
            source-layer="building"
            minzoom={14}
            beforeId={labelLayerId}
            paint={{
              "fill-extrusion-color": "rgb(210, 210, 206)",
              "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 16, ["get", "render_height"]],
              "fill-extrusion-base": ["step", ["zoom"], 0, 15, ["get", "render_min_height"]],
              "fill-extrusion-opacity": 0.75,
            }}
          />
        )}

        <DeckGLOverlay interleaved layers={layers} effects={[lightingEffect]} getTooltip={getTooltip} />

        {latestAnnotations.map((detection) => {
          const node = DRAIN_NODES.find((n) => n.drain_id === detection.drain_id);
          if (!node) return null;
          const label =
            detection.classification === "confirmed_blockage"
              ? "BLOCKAGE CONFIRMED"
              : detection.classification === "probable_blockage"
                ? "PROBABLE BLOCKAGE"
                : "ANOMALY DETECTED";
          return (
            <Marker key={detection.id} longitude={node.position[0]} latitude={node.position[1]} anchor="bottom">
              <button
                type="button"
                className={`silkboard-3d-annotation ${detection.risk_level === "red" ? "is-red" : "is-yellow"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectDetection(detection);
                }}
              >
                <strong>{label}</strong>
                <span>{detection.drain_id}: {detection.blockage_probability}%</span>
              </button>
            </Marker>
          );
        })}
      </MapGL>

      <div className="map-toolbar">
        <button type="button" className="dimension-toggle-button" onClick={handleToggleDimension} aria-label={is3D ? "Switch to 2D" : "Switch to 3D"}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5ZM3 8.5V16l9 4.5M21 8.5V16l-9 4.5" />
          </svg>
          {is3D ? "3D" : "2D"}
        </button>
        <button type="button" className="fit-city-button" onClick={handleFit} aria-label="Fit Silk Board Junction">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
          </svg>
          Fit junction
        </button>
      </div>

      <div className={`silkboard-map-legend ${legendOpen ? "" : "is-collapsed"}`}>
        <div className="legend-header">
          <p><strong>Silk Board Junction Network</strong></p>
          <button type="button" className="legend-toggle" onClick={() => setLegendOpen((v) => !v)} aria-label={legendOpen ? "Minimize legend" : "Expand legend"}>
            {legendOpen ? "−" : "+"}
          </button>
        </div>
        {legendOpen && (
          <>
            <div className="legend-section">
              <span><i style={{ background: "#475569", height: 4, width: 14 }} /> Flyover Deck (L1/L2)</span>
              <span><i style={{ background: "#1d4ed8", height: 3, width: 14 }} /> Ground Drain</span>
              <span><i style={{ background: "#ef4444", borderRadius: "50%" }} /> Drain Inlet</span>
              <span><i style={{ background: "#22c55e", borderRadius: "50%" }} /> Drain Node Hub (height = risk)</span>
            </div>
            <div className="legend-section">
              <span><i style={{ background: "#94a3b8", borderRadius: "50%", width: 6, height: 6 }} /> Dry</span>
              <span><i style={{ background: "#60a5fa", borderRadius: "50%", width: 6, height: 6 }} /> Damp</span>
              <span><i style={{ background: "#f59e0b", borderRadius: "50%", width: 6, height: 6 }} /> Pooling</span>
              <span><i style={{ background: "#ef4444", borderRadius: "50%", width: 6, height: 6 }} /> Flooding</span>
            </div>
            <div className="legend-section">
              <span><i style={{ background: "#22c55e", borderRadius: "50%", border: "1.5px solid #fff" }} /> Camera Online</span>
              <span><i style={{ background: "#ef4444", borderRadius: "50%", border: "1.5px solid #fff" }} /> Camera Alert</span>
              <span><i style={{ background: "#6b7280", borderRadius: "50%", border: "1.5px solid #fff" }} /> Camera Offline</span>
            </div>
            <div className="legend-section">
              <span><i style={{ background: "#94a3b8", height: 2, width: 14 }} /> Real Drain Network (OpenCity)</span>
              <span><i style={{ background: "#f59e0b", borderRadius: "50%" }} /> BBMP-Flagged Flood Point</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
