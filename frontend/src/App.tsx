import { useEffect, useMemo, useState } from "react";
import { DrainDetails } from "./components/DrainDetails";
import { DrainExplorer } from "./components/DrainExplorer";
import { FlowAssistant } from "./components/FlowAssistant";
import { IncidentTimeline } from "./components/IncidentTimeline";
import { MapView } from "./components/MapView";
import { SimulationPanel } from "./components/SimulationPanel";
import {
  compareDrains,
  featureMatches,
  formatDistance,
  loadDrainDataset,
} from "./drains";
import { useDrainSimulation } from "./useDrainSimulation";
import {
  DRAIN_TYPES,
  type DrainDataset,
  type DrainFeature,
  type DrainType,
  type DrainTypeVisibility,
} from "./types";

const INITIAL_VISIBILITY: DrainTypeVisibility = {
  Primary: true,
  Secondary: true,
  Tertiary: true,
};
const DEMO_CENTER = [77.5946, 12.9716] as const;

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "teal" | "orange" | "red";
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className={`metric-value${tone ? ` tone-${tone}` : ""}`}>
        {value}
      </strong>
      <span className="metric-detail">{detail}</span>
    </div>
  );
}

function nearestDemoDrain(dataset: DrainDataset | null) {
  if (!dataset) return null;
  let best: DrainFeature | null = null;
  let bestDistance = Infinity;
  for (const feature of dataset.features) {
    if (feature.properties.type !== "Tertiary") continue;
    const [lon, lat] = feature.properties.center;
    const distance = (lon - DEMO_CENTER[0]) ** 2 + (lat - DEMO_CENTER[1]) ** 2;
    if (distance < bestDistance) {
      best = feature;
      bestDistance = distance;
    }
  }
  return best?.properties.id ?? null;
}

export default function App() {
  const [dataset, setDataset] = useState<DrainDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] =
    useState<DrainTypeVisibility>(INITIAL_VISIBILITY);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get("drain");
  });

  useEffect(() => {
    const controller = new AbortController();
    loadDrainDataset(controller.signal)
      .then(setDataset)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "The drain network could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  const defaultBlockageId = useMemo(() => nearestDemoDrain(dataset), [dataset]);
  const simulation = useDrainSimulation(dataset, selectedId, defaultBlockageId);

  const visibleFeatures = useMemo(() => {
    if (!dataset) return [];
    return dataset.features
      .filter((feature) => visibility[feature.properties.type])
      .filter((feature) => featureMatches(feature, query))
      .sort(compareDrains);
  }, [dataset, query, visibility]);

  const selectedFeature = useMemo<DrainFeature | null>(
    () => dataset?.features.find((feature) => feature.properties.id === selectedId) ?? null,
    [dataset, selectedId],
  );

  const visibleLength = useMemo(
    () => visibleFeatures.reduce((sum, feature) => sum + feature.properties.lengthMeters, 0),
    [visibleFeatures],
  );

  const filterKey = useMemo(
    () =>
      `${DRAIN_TYPES.filter((type) => visibility[type]).join("-")}:${query.trim().toLowerCase()}`,
    [query, visibility],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedId) params.set("drain", selectedId);
    else params.delete("drain");
    const nextQuery = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`,
    );
  }, [selectedId]);

  function toggleType(type: DrainType) {
    setVisibility((current) => ({ ...current, [type]: !current[type] }));
  }

  function showOnlyType(type: DrainType | null) {
    if (!type) {
      setVisibility({ Primary: true, Secondary: true, Tertiary: true });
      return;
    }
    setVisibility({
      Primary: type === "Primary",
      Secondary: type === "Secondary",
      Tertiary: type === "Tertiary",
    });
  }

  if (error) {
    return (
      <main className="state-screen">
        <div className="state-mark">!</div>
        <p className="eyebrow">Data load failed</p>
        <h1>The network map is unavailable.</h1>
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }

  if (!dataset) {
    return (
      <main className="state-screen loading-screen">
        <div className="brand-mark large" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">UrbanFlow / Bengaluru</p>
        <h1>Preparing the city drain network</h1>
        <div className="loading-line" aria-label="Loading" />
        <p>Loading 6,839 mapped stormwater segments...</p>
      </main>
    );
  }

  const { metadata } = dataset;
  const metrics = simulation.snapshot?.metrics;
  const selectedTelemetry = simulation.snapshot?.selectedTelemetry ?? null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="eyebrow">Bengaluru infrastructure atlas</p>
            <h1>UrbanFlow</h1>
          </div>
        </div>
        <div className="topbar-context">
          <a href={metadata.sourceUrl} target="_blank" rel="noreferrer" className="source-link">
            OpenCity source <span aria-hidden="true">-&gt;</span>
          </a>
        </div>
      </header>

      <section className="metrics-bar" aria-label="Network overview">
        <div className="metrics-intro">
          <p className="eyebrow">Operations overview</p>
          <h2>Bengaluru stormwater drains</h2>
        </div>
        <Metric
          label="Mapped network"
          value={formatDistance(metadata.totalLengthMeters)}
          detail="Real recorded geometry"
        />
        <Metric
          label="Drain segments"
          value={metadata.totalFeatures.toLocaleString("en-IN")}
          detail={`${(metrics?.connectedSegments ?? 0).toLocaleString("en-IN")} graph-connected`}
        />
        <Metric
          label="Rainfall"
          value={`${Math.round(simulation.config.rainfallMmHr)} mm/hr`}
          detail={`${simulation.config.scenario} scenario`}
          tone="teal"
        />
        <Metric
          label="Critical"
          value={(metrics?.criticalCount ?? 0).toLocaleString("en-IN")}
          detail={`${(metrics?.watchCount ?? 0).toLocaleString("en-IN")} on watch`}
          tone="red"
        />
        <Metric
          label="Network load"
          value={`${Math.round((metrics?.averageUtilization ?? 0) * 100)}%`}
          detail={`${(metrics?.overflowCount ?? 0).toLocaleString("en-IN")} over capacity`}
          tone="orange"
        />
      </section>

      <main className="workspace control-room">
        <DrainExplorer
          features={visibleFeatures}
          categories={metadata.categories}
          query={query}
          visibility={visibility}
          selectedId={selectedId}
          telemetryById={simulation.telemetryById}
          visibleLength={visibleLength}
          onQueryChange={setQuery}
          onToggleType={toggleType}
          onSelect={setSelectedId}
        />

        <section className="map-stage" aria-label="Interactive stormwater drain map">
          <MapView
            features={visibleFeatures}
            selectedFeature={selectedFeature}
            cityBounds={metadata.bounds}
            filterKey={filterKey}
            telemetryById={simulation.telemetryById}
            simulationTick={simulation.snapshot?.tick ?? 0}
            onSelect={setSelectedId}
          />
          <div className="map-count">
            <span>{visibleFeatures.length.toLocaleString("en-IN")}</span>
            segments visible
            {(metrics?.criticalCount ?? 0) > 0 && (
              <b>{metrics?.criticalCount.toLocaleString("en-IN")} critical</b>
            )}
          </div>
        </section>

        <aside className="ops-rail">
          <SimulationPanel
            config={simulation.config}
            snapshot={simulation.snapshot}
            selectedId={selectedId}
            defaultBlockageId={defaultBlockageId}
            onStartScenario={simulation.startScenario}
            onSetRainfall={simulation.setRainfall}
            onSetRunning={simulation.setRunning}
            onSetSpeed={simulation.setSpeed}
            onSelect={setSelectedId}
          />

          {selectedFeature ? (
            <DrainDetails
              feature={selectedFeature}
              sourceUrl={metadata.sourceUrl}
              telemetry={selectedTelemetry}
              history={simulation.selectedHistory}
              upstreamIds={simulation.snapshot?.upstreamIds ?? []}
              downstreamIds={simulation.snapshot?.downstreamIds ?? []}
              onSelectNeighbor={setSelectedId}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <section className="selection-prompt">
              <span className="selection-mark">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
                  <circle cx="12" cy="10" r="2" />
                </svg>
              </span>
              <div>
                <h3>Inspect a segment</h3>
                <p>Select any drain line or priority item to view telemetry and estimated flow relationships.</p>
              </div>
            </section>
          )}

          <IncidentTimeline
            events={simulation.events}
            onSelect={setSelectedId}
            onClear={simulation.clearEvents}
          />
        </aside>
      </main>

      <FlowAssistant
        dataset={dataset}
        config={simulation.config}
        snapshot={simulation.snapshot}
        selectedFeature={selectedFeature}
        selectedTelemetry={selectedTelemetry}
        telemetryById={simulation.telemetryById}
        defaultBlockageId={defaultBlockageId}
        onStartScenario={simulation.startScenario}
        onSetRainfall={simulation.setRainfall}
        onSetRunning={simulation.setRunning}
        onSetSpeed={simulation.setSpeed}
        onSelect={setSelectedId}
        onShowType={showOnlyType}
      />
    </div>
  );
}
