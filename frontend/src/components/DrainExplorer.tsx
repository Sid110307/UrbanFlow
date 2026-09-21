import { formatDistance } from "../drains";
import {
  DRAIN_TYPES,
  type DrainCategorySummary,
  type DrainFeature,
  type DrainType,
  type DrainTypeVisibility,
  type SegmentTelemetry,
} from "../types";

const RESULT_LIMIT = 140;

export function DrainExplorer({
  features,
  categories,
  query,
  visibility,
  selectedId,
  telemetryById,
  visibleLength,
  onQueryChange,
  onToggleType,
  onSelect,
}: {
  features: DrainFeature[];
  categories: Record<DrainType, DrainCategorySummary>;
  query: string;
  visibility: DrainTypeVisibility;
  selectedId: string | null;
  telemetryById: Record<string, SegmentTelemetry>;
  visibleLength: number;
  onQueryChange: (query: string) => void;
  onToggleType: (type: DrainType) => void;
  onSelect: (id: string) => void;
}) {
  const shownFeatures = features.slice(0, RESULT_LIMIT);

  return (
    <aside className="explorer">
      <div className="explorer-head">
        <div>
          <p className="eyebrow">Network directory</p>
          <h2>Explore drains</h2>
        </div>
      </div>

      <label className="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <span className="sr-only">Search drain segments</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search ID, type or source ref"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => onQueryChange("")}>
            x
          </button>
        )}
      </label>

      <div className="type-filters" aria-label="Filter by drain order">
        {DRAIN_TYPES.map((type) => (
          <button
            type="button"
            key={type}
            className={`type-filter filter-${type.toLowerCase()}${visibility[type] ? " active" : ""}`}
            aria-pressed={visibility[type]}
            onClick={() => onToggleType(type)}
          >
            <i />
            <span>{type}</span>
            <strong>{categories[type].count.toLocaleString("en-IN")}</strong>
          </button>
        ))}
      </div>

      <div className="directory-summary">
        <span>
          <strong>{features.length.toLocaleString("en-IN")}</strong> matching segments
        </span>
        <span>{formatDistance(visibleLength)} shown</span>
      </div>

      <div className="drain-list">
        {shownFeatures.map((feature) => {
          const drain = feature.properties;
          const telemetry = telemetryById[drain.id];
          return (
            <button
              type="button"
              key={drain.id}
              className={`drain-row${selectedId === drain.id ? " selected" : ""}${telemetry ? ` row-${telemetry.status}` : ""}`}
              onClick={() => onSelect(drain.id)}
            >
              <span className={`line-swatch swatch-${drain.type.toLowerCase()}`} />
              <span className="drain-row-copy">
                <span className="drain-row-top">
                  <strong>{drain.id}</strong>
                  <small>
                    {telemetry
                      ? `${Math.round(telemetry.utilization * 100)}% ${telemetry.status}`
                      : formatDistance(drain.lengthMeters)}
                  </small>
                </span>
                <span className="drain-row-bottom">
                  <span>{drain.type} drain</span>
                  <span>Source #{drain.sourceId}</span>
                </span>
              </span>
              <span className="row-arrow" aria-hidden="true">
                &gt;
              </span>
            </button>
          );
        })}

        {features.length === 0 && (
          <div className="empty-list">
            <span>0</span>
            <h3>No matching drains</h3>
            <p>Try another source ID or turn a drain order back on.</p>
          </div>
        )}

        {features.length > RESULT_LIMIT && (
          <p className="list-limit">
            Showing the first {RESULT_LIMIT.toLocaleString("en-IN")} results. Refine your search to
            find a specific segment.
          </p>
        )}
      </div>
    </aside>
  );
}
