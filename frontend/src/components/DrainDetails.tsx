import { formatDistance } from "../data/drains";
import type {
  DrainFeature,
  SegmentTelemetry,
  TelemetryPoint,
} from "../types";

function coordinate(value: number, axis: "lat" | "lon") {
  const suffix = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(5)} deg ${suffix}`;
}

function CapacityChart({ history }: { history: TelemetryPoint[] }) {
  const width = 300;
  const height = 76;
  const padding = 6;
  const points = history.length > 1
    ? history
        .map((point, index) => {
          const x = padding + (index / (history.length - 1)) * (width - padding * 2);
          const y =
            height -
            padding -
            Math.min(1.25, point.utilization) / 1.25 * (height - padding * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : "";
  const thresholdY =
    height - padding - 0.9 / 1.25 * (height - padding * 2);

  return (
    <div className="capacity-chart">
      <div>
        <span>Capacity trend</span>
        <small>Last {history.length || 0} model steps</small>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Capacity history chart">
        <line x1="0" x2={width} y1={thresholdY} y2={thresholdY} className="threshold-line" />
        {points && <polyline points={points} />}
      </svg>
      <span className="threshold-label">90% critical threshold</span>
    </div>
  );
}

export function DrainDetails({
  feature,
  sourceUrl,
  telemetry,
  history,
  upstreamIds,
  downstreamIds,
  onSelectNeighbor,
  onClose,
}: {
  feature: DrainFeature;
  sourceUrl: string;
  telemetry: SegmentTelemetry | null;
  history: TelemetryPoint[];
  upstreamIds: string[];
  downstreamIds: string[];
  onSelectNeighbor: (id: string) => void;
  onClose: () => void;
}) {
  const drain = feature.properties;
  const [minLon, minLat, maxLon, maxLat] = drain.bounds;
  const status = telemetry?.status ?? "normal";

  return (
    <section className="details-card rail-details" aria-label={`Details for ${drain.id}`}>
      <header className="details-head">
        <div>
          <span className={`order-chip chip-${drain.type.toLowerCase()}`}>
            <i />
            {drain.type} network
          </span>
          <h2>{drain.id}</h2>
          <p>Mapped stormwater drain segment</p>
        </div>
        <button type="button" className="details-close" onClick={onClose} aria-label="Close details">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div className={`telemetry-hero telemetry-${status}`}>
        <div>
          <span>Simulated live state</span>
          <strong>{status.toUpperCase()}</strong>
        </div>
        <div>
          <span>Capacity</span>
          <strong>{Math.round((telemetry?.utilization ?? 0) * 100)}%</strong>
        </div>
        <i
          style={{ width: `${Math.min(100, (telemetry?.utilization ?? 0) * 100)}%` }}
        />
      </div>

      <section className="detail-section">
        <p className="detail-kicker">Simulated telemetry</p>
        <div className="telemetry-grid">
          <div>
            <span>Water level</span>
            <strong>{telemetry ? `${telemetry.waterLevelCm.toFixed(0)} cm` : "--"}</strong>
          </div>
          <div>
            <span>Flow</span>
            <strong>{telemetry ? `${telemetry.flowMps.toFixed(2)} m/s` : "--"}</strong>
          </div>
          <div>
            <span>Local rain</span>
            <strong>{telemetry ? `${telemetry.localRainfallMmHr.toFixed(0)} mm/hr` : "--"}</strong>
          </div>
          <div>
            <span>Trend</span>
            <strong className={`trend-${telemetry?.trend ?? "steady"}`}>
              {telemetry?.trend ?? "steady"}
            </strong>
          </div>
        </div>
        <CapacityChart history={history} />
      </section>

      {(upstreamIds.length > 0 || downstreamIds.length > 0) && (
        <section className="detail-section">
          <p className="detail-kicker">Estimated flow relationships</p>
          <div className="relationship-groups">
            <div>
              <span>Upstream</span>
              <div>
                {upstreamIds.map((id) => (
                  <button type="button" key={id} onClick={() => onSelectNeighbor(id)}>
                    {id}
                  </button>
                ))}
                {upstreamIds.length === 0 && <small>None snapped</small>}
              </div>
            </div>
            <div>
              <span>Downstream</span>
              <div>
                {downstreamIds.map((id) => (
                  <button type="button" key={id} onClick={() => onSelectNeighbor(id)}>
                    {id}
                  </button>
                ))}
                {downstreamIds.length === 0 && <small>None snapped</small>}
              </div>
            </div>
          </div>
          <p className="relationship-note">
            Direction is estimated from drain hierarchy and deterministic topology scoring.
          </p>
        </section>
      )}

      <section className="detail-section">
        <p className="detail-kicker">GIS source record</p>
        <dl className="detail-grid">
          <div>
            <dt>Recorded length</dt>
            <dd>{formatDistance(drain.lengthMeters)}</dd>
          </div>
          <div>
            <dt>Object ID</dt>
            <dd>{drain.sourceId}</dd>
          </div>
          <div>
            <dt>Geometry</dt>
            <dd>{feature.geometry.type === "MultiLineString" ? "Multi-line" : "Line"}</dd>
          </div>
          <div>
            <dt>Mapped vertices</dt>
            <dd>{drain.originalVertices.toLocaleString("en-IN")}</dd>
          </div>
        </dl>
      </section>

      <section className="detail-section">
        <p className="detail-kicker">Location</p>
        <div className="coordinate-block">
          <span>
            Centre
            <strong>
              {coordinate(drain.center[1], "lat")}, {coordinate(drain.center[0], "lon")}
            </strong>
          </span>
          <span>
            Extent
            <strong>
              {coordinate(minLat, "lat")} - {coordinate(maxLat, "lat")}
              <br />
              {coordinate(minLon, "lon")} - {coordinate(maxLon, "lon")}
            </strong>
          </span>
        </div>
      </section>

      <footer className="details-foot">
        <div className="source-seal">OC</div>
        <div>
          <span>Published by OpenCity</span>
          <small>Source: BBMP | Public domain</small>
        </div>
        <a href={sourceUrl} target="_blank" rel="noreferrer" aria-label="Open source dataset">
          -&gt;
        </a>
      </footer>
    </section>
  );
}
