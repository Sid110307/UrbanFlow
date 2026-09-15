import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { RISK_LABEL, RISK_ORDER } from "../labels";
import type { Drain, RiskLevel } from "../types";

const RISK_COLOR: Record<RiskLevel, string> = {
  green: "#2f8a52",
  yellow: "#a6790a",
  red: "#b23b30",
};

export function MapView({
  drains,
  onSelect,
}: {
  drains: Drain[];
  onSelect: (drainId: string) => void;
}) {
  const center: [number, number] =
    drains.length > 0
      ? [
          drains.reduce((s, d) => s + d.lat, 0) / drains.length,
          drains.reduce((s, d) => s + d.lon, 0) / drains.length,
        ]
      : [12.935, 77.68];

  return (
    <>
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {drains.map((d) => (
          <CircleMarker
            key={d.drain_id}
            center={[d.lat, d.lon]}
            radius={d.status === "red" ? 9 : d.status === "yellow" ? 8 : 6}
            pathOptions={{
              color: "#1b1f26",
              weight: 1.5,
              fillColor: RISK_COLOR[d.status] ?? RISK_COLOR.green,
              fillOpacity: 0.9,
            }}
            eventHandlers={{ click: () => onSelect(d.drain_id) }}
          >
            <Popup>
              <strong>{d.name}</strong>
              <br />
              {d.drain_id}
              <br />
              status: {RISK_LABEL[d.status]}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-legend">
        {RISK_ORDER.map((level) => (
          <div className="map-legend-row" key={level}>
            <span className="status-dot" style={{ background: RISK_COLOR[level] }} />
            {RISK_LABEL[level]}
          </div>
        ))}
      </div>
    </>
  );
}
