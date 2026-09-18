import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Coordinate,
  DrainDataset,
  DrainFeature,
  ScenarioKind,
  SegmentTelemetry,
  SimulationConfig,
  SimulationEvent,
  SimulationSnapshot,
  SimulationWorkerMessage,
  SimulationWorkerResponse,
  TelemetryPoint,
  WorkerSegment,
} from "../types";

const STORAGE_KEY = "urbanflow-demo-simulation";
const DEFAULT_CONFIG: SimulationConfig = {
  scenario: "normal",
  rainfallMmHr: 8,
  running: true,
  speed: 1,
  blockedId: null,
  elapsedMinutes: 0,
};

function readInitialConfig(): SimulationConfig {
  let stored: Partial<SimulationConfig> = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<SimulationConfig>;
  } catch {
    stored = {};
  }

  const params = new URLSearchParams(window.location.search);
  const scenarioParam = params.get("scenario");
  const scenario: ScenarioKind =
    scenarioParam === "cloudburst" || scenarioParam === "blockage"
      ? scenarioParam
      : stored.scenario ?? "normal";
  const rainParam = Number(params.get("rain"));
  const rainfallMmHr = Number.isFinite(rainParam) && rainParam >= 0
    ? rainParam
    : stored.rainfallMmHr ?? DEFAULT_CONFIG.rainfallMmHr;
  const speed = stored.speed === 2 || stored.speed === 4 ? stored.speed : 1;

  return {
    scenario,
    rainfallMmHr,
    running: stored.running ?? true,
    speed,
    blockedId: params.get("blocked") ?? stored.blockedId ?? null,
    elapsedMinutes: 0,
  };
}

function firstAndLast(feature: DrainFeature): [Coordinate, Coordinate] {
  if (feature.geometry.type === "LineString") {
    return [
      feature.geometry.coordinates[0],
      feature.geometry.coordinates[feature.geometry.coordinates.length - 1] ?? feature.geometry.coordinates[0],
    ];
  }
  const firstLine = feature.geometry.coordinates[0];
  const lastLine = feature.geometry.coordinates[feature.geometry.coordinates.length - 1] ?? firstLine;
  return [
    firstLine[0],
    lastLine[lastLine.length - 1] ?? firstLine[0],
  ];
}

function toWorkerSegment(feature: DrainFeature): WorkerSegment {
  return {
    id: feature.properties.id,
    type: feature.properties.type,
    lengthMeters: feature.properties.lengthMeters,
    center: feature.properties.center,
    endpoints: firstAndLast(feature),
  };
}

export function useDrainSimulation(
  dataset: DrainDataset | null,
  selectedId: string | null,
  defaultBlockageId: string | null,
) {
  const workerRef = useRef<Worker | null>(null);
  const [config, setConfig] = useState<SimulationConfig>(readInitialConfig);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<TelemetryPoint[]>([]);
  const [ready, setReady] = useState(false);

  const workerSegments = useMemo(
    () => dataset?.features.map(toWorkerSegment) ?? [],
    [dataset],
  );

  useEffect(() => {
    if (!dataset || workerSegments.length === 0) return;
    const worker = new Worker(
      new URL("../workers/simulation.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    const initialConfig = {
      ...config,
      blockedId:
        config.scenario === "blockage"
          ? config.blockedId ?? defaultBlockageId
          : null,
    };

    worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
      const message = event.data;
      if (message.type === "READY") {
        setReady(true);
        return;
      }

      const nextSnapshot = message.snapshot;
      setSnapshot(nextSnapshot);
      setConfig((current) => ({
        ...current,
        elapsedMinutes: nextSnapshot.elapsedMinutes,
      }));

      if (nextSnapshot.events.length > 0) {
        setEvents((current) => [
          ...[...nextSnapshot.events].reverse(),
          ...current,
        ].slice(0, 40));
      }

      if (nextSnapshot.selectedTelemetry) {
        const point: TelemetryPoint = {
          ...nextSnapshot.selectedTelemetry,
          elapsedMinutes: nextSnapshot.elapsedMinutes,
        };
        setSelectedHistory((current) => [...current, point].slice(-36));
      }
    };

    const message: SimulationWorkerMessage = {
      type: "INIT",
      segments: workerSegments,
      config: initialConfig,
      selectedId,
    };
    worker.postMessage(message);

    return () => {
      worker.terminate();
      workerRef.current = null;
      setReady(false);
    };
    // The worker is intentionally tied to the immutable dataset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, workerSegments]);

  useEffect(() => {
    setSelectedHistory([]);
    const message: SimulationWorkerMessage = { type: "SELECT", selectedId };
    workerRef.current?.postMessage(message);
  }, [selectedId]);

  useEffect(() => {
    const saved = {
      scenario: config.scenario,
      rainfallMmHr: config.rainfallMmHr,
      running: config.running,
      speed: config.speed,
      blockedId: config.blockedId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    const params = new URLSearchParams(window.location.search);
    if (config.scenario === "normal") params.delete("scenario");
    else params.set("scenario", config.scenario);
    if (config.scenario === "normal" && config.rainfallMmHr === 8) params.delete("rain");
    else params.set("rain", String(Math.round(config.rainfallMmHr)));
    if (config.blockedId) params.set("blocked", config.blockedId);
    else params.delete("blocked");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [
    config.blockedId,
    config.rainfallMmHr,
    config.running,
    config.scenario,
    config.speed,
  ]);

  const sendControl = useCallback((patch: Partial<SimulationConfig>) => {
    setConfig((current) => {
      const next = { ...current, ...patch };
      const message: SimulationWorkerMessage = { type: "CONTROL", config: patch };
      workerRef.current?.postMessage(message);
      return next;
    });
  }, []);

  const startScenario = useCallback(
    (scenario: ScenarioKind, blockedId?: string | null) => {
      const rainfallByScenario: Record<ScenarioKind, number> = {
        normal: 8,
        cloudburst: 72,
        blockage: 34,
      };
      const resolvedBlockedId =
        scenario === "blockage" ? blockedId ?? defaultBlockageId : null;
      sendControl({
        scenario,
        rainfallMmHr: rainfallByScenario[scenario],
        blockedId: resolvedBlockedId,
        elapsedMinutes: 0,
        running: true,
      });
    },
    [defaultBlockageId, sendControl],
  );

  const setRainfall = useCallback(
    (rainfallMmHr: number) => sendControl({ rainfallMmHr }),
    [sendControl],
  );
  const setRunning = useCallback(
    (running: boolean) => sendControl({ running }),
    [sendControl],
  );
  const setSpeed = useCallback(
    (speed: 1 | 2 | 4) => sendControl({ speed }),
    [sendControl],
  );
  const reset = useCallback(() => startScenario("normal"), [startScenario]);

  const telemetryById = useMemo(
    () =>
      Object.fromEntries(
        (snapshot?.affected ?? []).map((telemetry) => [telemetry.id, telemetry]),
      ) as Record<string, SegmentTelemetry>,
    [snapshot],
  );

  return {
    ready,
    config,
    snapshot,
    events,
    selectedHistory,
    telemetryById,
    startScenario,
    setRainfall,
    setRunning,
    setSpeed,
    reset,
    clearEvents: () => setEvents([]),
  };
}

