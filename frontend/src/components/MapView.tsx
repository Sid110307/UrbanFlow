import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, useControl } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import type { MapLibreOverlayProps } from "@deck.gl/maplibre";
import { LightingEffect, AmbientLight, DirectionalLight } from "@deck.gl/core";
import type { PickingInfo } from "@deck.gl/core";
import { PathLayer } from "@deck.gl/layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import type {
  Bounds,
  DrainFeature,
  DrainProperties,
  DrainType,
  RiskStatus,
  SegmentTelemetry,
} from "../types";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const BENGALURU_CENTER: [number, number] = [77.5946, 12.9716];

const TYPE_COLOR: Record<DrainType, [number, number, number]> = {
  Primary: [8, 127, 117],
  Secondary: [224, 151, 60],
  Tertiary: [121, 168, 158],
};

const TYPE_WIDTH: Record<DrainType, number> = {
  Primary: 3.4,
  Secondary: 2.4,
  Tertiary: 1.3,
};

const RISK_COLOR: Record<RiskStatus, [number, number, number]> = {
  normal: [121, 168, 158],
  watch: [240, 173, 44],
  critical: [237, 90, 69],
  blocked: [150, 60, 136],
};

const RISK_BASE_HEIGHT: Record<RiskStatus, number> = {
  normal: 0,
  watch: 30,
  critical: 70,
  blocked: 120,
};

const DEFAULT_3D_PITCH = 50;
const DEFAULT_3D_BEARING = -12;

const lightingEffect = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.3 }),
  main: new DirectionalLight({
    color: [255, 255, 255],
    intensity: 1.6,
    direction: [-2, -3, -1],
  }),
});

type PathDatum = { path: [number, number, number][]; properties: DrainProperties };

function toPaths(features: DrainFeature[], elevationFor: (properties: DrainProperties) => number): PathDatum[] {
  const paths: PathDatum[] = [];
  for (const feature of features) {
    const z = elevationFor(feature.properties);
    if (feature.geometry.type === "LineString") {
      paths.push({
        path: feature.geometry.coordinates.map(([lng, lat]) => [lng, lat, z]),
        properties: feature.properties,
      });
    } else {
      for (const line of feature.geometry.coordinates) {
        paths.push({
          path: line.map(([lng, lat]) => [lng, lat, z]),
          properties: feature.properties,
        });
      }
    }
  }
  return paths;
}

function riskHeight(telemetry: SegmentTelemetry | undefined): number {
  if (!telemetry) return 0;
  return RISK_BASE_HEIGHT[telemetry.status] + telemetry.utilization * 40;
}

function tooltipContent(properties: DrainProperties, telemetry: SegmentTelemetry | undefined) {
  if (telemetry) {
    return {
      html: `<strong>${properties.id} - ${telemetry.status.toUpperCase()}</strong><span>${Math.round(
        telemetry.utilization * 100,
      )}% capacity | ${telemetry.waterLevelCm.toFixed(0)} cm</span>`,
      className: `drain-tooltip risk-tooltip tooltip-${telemetry.status}`,
    };
  }
  return {
    html: `<strong>${properties.id}</strong><span>${properties.type} drain - ${(
      properties.lengthMeters / 1000
    ).toLocaleString("en-IN", { maximumFractionDigits: 2 })} km</span>`,
    className: "drain-tooltip",
  };
}

function boundsToLngLat(bounds: Bounds): [[number, number], [number, number]] {
  return [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[3]],
  ];
}

function DeckGLOverlay(props: MapLibreOverlayProps) {
  const overlay = useControl<MapLibreOverlay>(() => new MapLibreOverlay(props));
  overlay.setProps(props);
  return null;
}

export function MapView({
  features,
  selectedFeature,
  cityBounds,
  filterKey,
  telemetryById,
  simulationTick,
  onSelect,
}: {
  features: DrainFeature[];
  selectedFeature: DrainFeature | null;
  cityBounds: Bounds;
  filterKey: string;
  telemetryById: Record<string, SegmentTelemetry>;
  simulationTick: number;
  onSelect: (id: string) => void;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const [is3D, setIs3D] = useState(true);
  const [labelLayerId, setLabelLayerId] = useState<string | undefined>(undefined);
  const hasInitializedRef = useRef(false);

  const handleStyleData = useCallback(
    (event: { target: MapLibreMap }) => {
      if (hasInitializedRef.current) return;
      const map = event.target;
      if (!map.isStyleLoaded()) return;
      hasInitializedRef.current = true;
      const style = map.getStyle();
      const labelLayer = style?.layers?.find(
        (layer) => layer.type === "symbol" && layer.layout && "text-field" in layer.layout,
      );
      setLabelLayerId(labelLayer?.id);
      map.fitBounds(boundsToLngLat(cityBounds), {
        padding: 36,
        pitch: DEFAULT_3D_PITCH,
        bearing: DEFAULT_3D_BEARING,
        duration: 0,
      });
    },
    [cityBounds],
  );

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const bounds = selectedFeature ? selectedFeature.properties.bounds : cityBounds;
    map.fitBounds(boundsToLngLat(bounds), {
      padding: 36,
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      duration: 500,
      maxZoom: 17,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityBounds, selectedFeature?.properties.id]);

  const riskFeatures = useMemo(
    () => features.filter((feature) => telemetryById[feature.properties.id]),
    [features, telemetryById],
  );

  const basePaths = useMemo(() => toPaths(features, () => 1), [features]);

  const riskPaths = useMemo(
    () => toPaths(riskFeatures, (properties) => riskHeight(telemetryById[properties.id])),
    [riskFeatures, telemetryById],
  );

  const selectedPaths = useMemo(() => {
    if (!selectedFeature) return null;
    const telemetry = telemetryById[selectedFeature.properties.id];
    const height = riskHeight(telemetry) + 2;
    return toPaths([selectedFeature], () => height);
  }, [selectedFeature, telemetryById]);

  const handleClick = useCallback(
    (info: PickingInfo) => {
      const datum = info.object as PathDatum | undefined;
      if (datum?.properties?.id) onSelect(datum.properties.id);
    },
    [onSelect],
  );

  const getTooltip = useCallback(
    (info: PickingInfo) => {
      const datum = info.object as PathDatum | undefined;
      if (!datum) return null;
      return tooltipContent(datum.properties, telemetryById[datum.properties.id]);
    },
    [telemetryById],
  );

  const handleFitNetwork = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.fitBounds(boundsToLngLat(cityBounds), {
      padding: 36,
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      duration: 500,
    });
  }, [cityBounds]);

  const handleToggleDimension = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    setIs3D((prevIs3D) => {
      const next = !prevIs3D;
      map.easeTo({
        pitch: next ? DEFAULT_3D_PITCH : 0,
        bearing: next ? DEFAULT_3D_BEARING : 0,
        duration: 450,
      });
      if (next) {
        map.dragRotate.enable();
      } else {
        map.dragRotate.disable();
      }
      return next;
    });
  }, []);

  const layers = useMemo(() => {
    const baseLayer = new PathLayer<PathDatum>({
      id: `base-${filterKey}`,
      data: basePaths,
      pickable: true,
      getPath: (d) => d.path,
      getColor: (d) => TYPE_COLOR[d.properties.type],
      getWidth: (d) => TYPE_WIDTH[d.properties.type],
      widthUnits: "pixels",
      widthMinPixels: 1,
      jointRounded: true,
      capRounded: true,
      onClick: handleClick,
    });

    const riskLayer =
      riskPaths.length > 0
        ? new PathLayer<PathDatum>({
            id: `risk-${filterKey}`,
            data: riskPaths,
            pickable: true,
            getPath: (d) => d.path,
            getColor: (d) => RISK_COLOR[telemetryById[d.properties.id]?.status ?? "normal"],
            getWidth: (d) => {
              const status = telemetryById[d.properties.id]?.status;
              return status === "blocked" ? 5 : status === "critical" ? 4 : 3;
            },
            widthUnits: "pixels",
            widthMinPixels: 2,
            jointRounded: true,
            capRounded: true,
            extensions: [new PathStyleExtension({ dash: true })],
            updateTriggers: {
              getColor: [telemetryById, simulationTick],
              getWidth: [telemetryById, simulationTick],
            },
            onClick: handleClick,
            ...({ getDashArray: [4, 3], dashJustified: true } as Record<string, unknown>),
          })
        : null;

    const selectedLayers = selectedPaths
      ? [
          new PathLayer<PathDatum>({
            id: "selected-halo",
            data: selectedPaths,
            getPath: (d) => d.path,
            getColor: [255, 255, 255],
            getWidth: 9,
            widthUnits: "pixels",
            jointRounded: true,
            capRounded: true,
            pickable: false,
          }),
          new PathLayer<PathDatum>({
            id: "selected-line",
            data: selectedPaths,
            getPath: (d) => d.path,
            getColor: () => {
              const telemetry = selectedFeature && telemetryById[selectedFeature.properties.id];
              return telemetry ? RISK_COLOR[telemetry.status] : ([17, 59, 55] as [number, number, number]);
            },
            getWidth: 4.5,
            widthUnits: "pixels",
            jointRounded: true,
            capRounded: true,
            pickable: false,
          }),
        ]
      : [];

    return [baseLayer, riskLayer, ...selectedLayers].filter(Boolean);
  }, [
    basePaths,
    filterKey,
    handleClick,
    riskPaths,
    selectedPaths,
    selectedFeature,
    simulationTick,
    telemetryById,
  ]);

  const typeEntries = useMemo(() => Object.keys(TYPE_COLOR) as DrainType[], []);
  const riskEntries = useMemo(() => ["watch", "critical", "blocked"] as RiskStatus[], []);

  return (
    <div className="network-map" onContextMenu={(event) => event.preventDefault()}>
      <Map
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={{
          longitude: BENGALURU_CENTER[0],
          latitude: BENGALURU_CENTER[1],
          zoom: 11,
          pitch: DEFAULT_3D_PITCH,
          bearing: DEFAULT_3D_BEARING,
        }}
        onStyleData={handleStyleData}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" }}
      >
        {labelLayerId && (
          <Layer
            id="3d-buildings"
            type="fill-extrusion"
            source="openmaptiles"
            source-layer="building"
            minzoom={15}
            beforeId={labelLayerId}
            filter={["!=", ["get", "hide_3d"], true]}
            paint={{
              "fill-extrusion-color": "rgb(200, 200, 196)",
              "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "render_height"]],
              "fill-extrusion-base": ["step", ["zoom"], 0, 16, ["get", "render_min_height"]],
              "fill-extrusion-opacity": 0.85,
            }}
          />
        )}
        <DeckGLOverlay interleaved layers={layers} effects={[lightingEffect]} getTooltip={getTooltip} />
      </Map>

      <div className="map-toolbar">
        <button
          type="button"
          className="dimension-toggle-button"
          onClick={handleToggleDimension}
          aria-label={is3D ? "Switch to 2D map view" : "Switch to 3D map view"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5ZM3 8.5V16l9 4.5M21 8.5V16l-9 4.5" />
          </svg>
          {is3D ? "3D" : "2D"}
        </button>

        <button
          type="button"
          className="fit-city-button"
          onClick={handleFitNetwork}
          aria-label="Fit the full Bengaluru drain network"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
          </svg>
          Fit network
        </button>
      </div>

      <div className="map-legend">
        <p>Source hierarchy</p>
        {typeEntries.map((type) => (
          <span key={type}>
            <i className={`legend-line legend-${type.toLowerCase()}`} />
            {type}
          </span>
        ))}
        <p className="risk-legend-title">Simulated state</p>
        {riskEntries.map((status) => (
          <span key={status}>
            <i
              className="legend-line"
              style={{
                background: `rgb(${RISK_COLOR[status].join(",")})`,
                height: status === "blocked" ? "4px" : "3px",
              }}
            />
            {status[0].toUpperCase() + status.slice(1)}
          </span>
        ))}
      </div>

      <div className="map-controls-hint" aria-hidden="true">
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 11V6a1.5 1.5 0 0 1 3 0v5M12 11V5a1.5 1.5 0 0 1 3 0v6M15 11v-2a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L3 14.4a1.4 1.4 0 0 1 2.2-1.7L7 15" />
          </svg>
          Drag to pan
        </span>
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 1 3.5 7.1M3 12v5h5" />
          </svg>
          Right-drag to tilt / rotate
        </span>
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M11 8v6M8 11h6M20 20l-4.35-4.35" />
          </svg>
          Scroll to zoom
        </span>
      </div>
    </div>
  );
}
