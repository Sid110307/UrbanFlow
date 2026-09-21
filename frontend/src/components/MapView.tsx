import { useEffect, useMemo } from "react";
import type { Feature, GeoJsonObject, Geometry } from "geojson";
import type { Layer, PathOptions } from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type {
  Bounds,
  DrainFeature,
  DrainProperties,
  DrainType,
  RiskStatus,
  SegmentTelemetry,
} from "../types";

const TYPE_STYLE: Record<DrainType, PathOptions> = {
  Primary: { color: "#087f75", weight: 3.1, opacity: 0.9 },
  Secondary: { color: "#e0973c", weight: 2.1, opacity: 0.75 },
  Tertiary: { color: "#79a89e", weight: 1.05, opacity: 0.48 },
};

const RISK_COLOR: Record<RiskStatus, string> = {
  normal: "#79a89e",
  watch: "#f0ad2c",
  critical: "#ed5a45",
  blocked: "#963c88",
};

function toLeafletBounds(bounds: Bounds): [[number, number], [number, number]] {
  return [
    [bounds[1], bounds[0]],
    [bounds[3], bounds[2]],
  ];
}

function MapController({
  cityBounds,
  selectedFeature,
}: {
  cityBounds: Bounds;
  selectedFeature: DrainFeature | null;
}) {
  const map = useMap();
  const selectedId = selectedFeature?.properties.id;

  useEffect(() => {
    if (selectedFeature) {
      map.fitBounds(toLeafletBounds(selectedFeature.properties.bounds), {
        animate: true,
        duration: 0.55,
        maxZoom: 16,
        padding: [42, 42],
      });
      return;
    }
    map.fitBounds(toLeafletBounds(cityBounds), { padding: [28, 28] });
  }, [cityBounds, map, selectedFeature, selectedId]);

  return null;
}

function FitCityButton({ bounds }: { bounds: Bounds }) {
  const map = useMap();
  return (
    <button
      type="button"
      className="fit-city-button"
      onClick={() => map.fitBounds(toLeafletBounds(bounds), { padding: [28, 28] })}
      aria-label="Fit the full Bengaluru drain network"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      </svg>
      Fit network
    </button>
  );
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
  const collection = useMemo(
    () =>
      ({
        type: "FeatureCollection",
        features,
      }) as GeoJsonObject,
    [features],
  );
  const riskFeatures = useMemo(
    () => features.filter((feature) => telemetryById[feature.properties.id]),
    [features, telemetryById],
  );
  const riskCollection = useMemo(
    () =>
      ({
        type: "FeatureCollection",
        features: riskFeatures,
      }) as GeoJsonObject,
    [riskFeatures],
  );

  function bindBaseFeature(
    feature: Feature<Geometry, DrainProperties>,
    layer: Layer,
  ) {
    const properties = feature.properties;
    const tooltip = document.createElement("div");
    tooltip.className = "drain-tooltip";
    const heading = document.createElement("strong");
    heading.textContent = properties.id;
    const meta = document.createElement("span");
    meta.textContent = `${properties.type} drain - ${(
      properties.lengthMeters / 1000
    ).toLocaleString("en-IN", { maximumFractionDigits: 2 })} km`;
    tooltip.append(heading, meta);
    layer.bindTooltip(tooltip, { sticky: true, direction: "top", opacity: 1 });
    layer.on("click", () => onSelect(properties.id));
  }

  function bindRiskFeature(
    feature: Feature<Geometry, DrainProperties>,
    layer: Layer,
  ) {
    const properties = feature.properties;
    const telemetry = telemetryById[properties.id];
    if (!telemetry) return;
    const tooltip = document.createElement("div");
    tooltip.className = `drain-tooltip risk-tooltip tooltip-${telemetry.status}`;
    const heading = document.createElement("strong");
    heading.textContent = `${properties.id} - ${telemetry.status.toUpperCase()}`;
    const meta = document.createElement("span");
    meta.textContent = `${Math.round(telemetry.utilization * 100)}% capacity | ${telemetry.waterLevelCm.toFixed(0)} cm`;
    tooltip.append(heading, meta);
    layer.bindTooltip(tooltip, { sticky: true, direction: "top", opacity: 1 });
    layer.on("click", () => onSelect(properties.id));
  }

  const mapCenter: [number, number] = [
    (cityBounds[1] + cityBounds[3]) / 2,
    (cityBounds[0] + cityBounds[2]) / 2,
  ];
  const selectedTelemetry = selectedFeature
    ? telemetryById[selectedFeature.properties.id]
    : undefined;

  return (
    <MapContainer
      center={mapCenter}
      zoom={11}
      minZoom={10}
      maxZoom={18}
      preferCanvas
      zoomControl
      className="network-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        className="clean-map-tiles"
        maxZoom={19}
      />

      <GeoJSON
        key={filterKey}
        data={collection}
        style={(feature) => TYPE_STYLE[feature?.properties?.type as DrainType]}
        onEachFeature={bindBaseFeature}
      />

      {riskFeatures.length > 0 && (
        <GeoJSON
          key={`risk-${simulationTick}-${filterKey}`}
          data={riskCollection}
          style={(feature) => {
            const telemetry = telemetryById[feature?.properties?.id as string];
            return {
              color: RISK_COLOR[telemetry?.status ?? "normal"],
              weight: telemetry?.status === "blocked" ? 5 : telemetry?.status === "critical" ? 4.2 : 3.2,
              opacity: 0.96,
              dashArray: telemetry?.status === "watch" ? "7 6" : "10 5",
              dashOffset: String(-(simulationTick % 12) * 2),
            };
          }}
          onEachFeature={bindRiskFeature}
        />
      )}

      {selectedFeature && (
        <>
          <GeoJSON
            key={`${selectedFeature.properties.id}-halo`}
            data={selectedFeature as GeoJsonObject}
            style={{ color: "#ffffff", weight: 9, opacity: 0.95 }}
            interactive={false}
          />
          <GeoJSON
            key={`${selectedFeature.properties.id}-selected-${simulationTick}`}
            data={selectedFeature as GeoJsonObject}
            style={{
              color: selectedTelemetry
                ? RISK_COLOR[selectedTelemetry.status]
                : "#113b37",
              weight: 4.5,
              opacity: 1,
              dashArray: selectedTelemetry ? "9 5" : undefined,
              dashOffset: String(-(simulationTick % 12) * 2),
            }}
            interactive={false}
          />
        </>
      )}

      <MapController cityBounds={cityBounds} selectedFeature={selectedFeature} />
      <FitCityButton bounds={cityBounds} />

      <div className="map-legend">
        <p>Source hierarchy</p>
        {(Object.keys(TYPE_STYLE) as DrainType[]).map((type) => (
          <span key={type}>
            <i className={`legend-line legend-${type.toLowerCase()}`} />
            {type}
          </span>
        ))}
        <p className="risk-legend-title">Simulated state</p>
        {(["watch", "critical", "blocked"] as RiskStatus[]).map((status) => (
          <span key={status}>
            <i
              className="legend-line"
              style={{ background: RISK_COLOR[status], height: status === "blocked" ? 4 : 3 }}
            />
            {status[0].toUpperCase() + status.slice(1)}
          </span>
        ))}
      </div>
    </MapContainer>
  );
}
