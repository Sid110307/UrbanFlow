import { useEffect, useRef, useState } from "react";
import { formatDistance } from "../data/drains";
import type {
  DrainDataset,
  DrainFeature,
  DrainType,
  ScenarioKind,
  SegmentTelemetry,
  SimulationConfig,
  SimulationSnapshot,
} from "../types";

interface AssistantMessage {
  id: number;
  role: "assistant" | "user";
  text: string;
}

const STARTERS = [
  "What needs attention?",
  "List the top 5 critical segments",
  "Show upstream neighbors",
  "Compare PRI-0035 and TER-0170",
];

function extractIds(text: string): string[] {
  const matches = [...text.matchAll(/\b(pri|sec|ter)[-\s]?(\d{1,4})\b/gi)];
  const ids = matches.map((match) => `${match[1].toUpperCase()}-${match[2].padStart(4, "0")}`);
  return Array.from(new Set(ids));
}

export function FlowAssistant({
  dataset,
  config,
  snapshot,
  selectedFeature,
  selectedTelemetry,
  telemetryById,
  defaultBlockageId,
  onStartScenario,
  onSetRainfall,
  onSetRunning,
  onSetSpeed,
  onSelect,
  onShowType,
}: {
  dataset: DrainDataset;
  config: SimulationConfig;
  snapshot: SimulationSnapshot | null;
  selectedFeature: DrainFeature | null;
  selectedTelemetry: SegmentTelemetry | null;
  telemetryById: Record<string, SegmentTelemetry>;
  defaultBlockageId: string | null;
  onStartScenario: (scenario: ScenarioKind, blockedId?: string | null) => void;
  onSetRainfall: (rainfall: number) => void;
  onSetRunning: (running: boolean) => void;
  onSetSpeed: (speed: 1 | 2 | 4) => void;
  onSelect: (id: string) => void;
  onShowType: (type: DrainType | null) => void;
}) {
  const [open, setOpen] = useState(() => window.innerWidth > 820);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 1,
      role: "assistant",
      text:
        "I am Flow Assist, an on-device operations guide. Ask about the real drain dataset, inspect risk, or tell me to run a scenario.",
    },
  ]);
  const messageId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  function segmentExplanation() {
    if (!selectedFeature) {
      return "Select a drain on the map, or give me an ID such as PRI-0035, and I will explain its current state.";
    }
    const drain = selectedFeature.properties;
    if (!selectedTelemetry) {
      return `${drain.id} is a ${drain.type.toLowerCase()} segment with ${formatDistance(drain.lengthMeters)} of mapped linework. Its simulated state is still initializing.`;
    }
    const utilizationPct = Math.round(selectedTelemetry.utilization * 100);
    const reason =
      selectedTelemetry.status === "blocked"
        ? "An injected obstruction has reduced flow here and is backing water into connected segments."
        : selectedTelemetry.status === "critical"
          ? `Local runoff is running ${utilizationPct - 90} points over the 90% critical threshold and ${selectedTelemetry.trend}.`
          : selectedTelemetry.status === "watch"
            ? `Capacity is ${utilizationPct - 68} points past the 68% watch threshold and ${selectedTelemetry.trend}.`
            : "The segment remains within its modeled operating capacity.";
    const upstream = snapshot?.upstreamIds ?? [];
    const downstream = snapshot?.downstreamIds ?? [];
    const neighborCount = upstream.length + downstream.length;
    const neighborNote =
      neighborCount > 0
        ? ` It has ${upstream.length} upstream and ${downstream.length} downstream neighbor${neighborCount === 1 ? "" : "s"} in the snapped graph.`
        : " It has no snapped neighbors in the endpoint graph.";
    return `${drain.id} is at ${utilizationPct}% simulated capacity with ${selectedTelemetry.waterLevelCm.toFixed(0)} cm water level and ${selectedTelemetry.flowMps.toFixed(2)} m/s flow. ${reason}${neighborNote}`;
  }

  function describeSegment(id: string) {
    const feature = dataset.features.find((candidate) => candidate.properties.id === id);
    if (!feature) return null;
    return { feature, telemetry: telemetryById[id] };
  }

  function responseFor(raw: string) {
    const text = raw.toLowerCase().trim();

    if (/^\s*(hi|hey|hello|yo|hola)[\s!.,]*$/.test(text)) {
      return "Hello. Ask about network risk, run a scenario, or give me a drain ID such as PRI-0035.";
    }

    if (/^\s*(thanks|thank you|thx|cheers)[\s!.,]*$/.test(text)) {
      return "You are welcome. Anything else to check before the next scenario?";
    }

    if (/who are you|what are you|are you (a )?real|are you (an )?ai|are you gemini|are you chatgpt|are you gpt/.test(text)) {
      return "I am a keyword-matched intent engine reading this simulation's live snapshot, not a hosted AI model. I run entirely in your browser, with no network calls.";
    }

    if (/what can you do|help|commands|how do i/.test(text)) {
      return "I can start or reset scenarios, inject a blockage, set rainfall, pause or change speed, filter drain orders, look up an ID, list the top critical segments, show a segment's upstream and downstream neighbors, compare two drains, and explain the selected segment. Try: set rain to 60, list top 5, show upstream neighbors, or why is this critical?";
    }

    if (/compare|versus|\bvs\b/.test(text)) {
      const ids = extractIds(text);
      if (ids.length < 2) {
        return 'Give me two drain IDs to compare, for example "compare PRI-0035 and TER-0170".';
      }
      const [idA, idB] = ids;
      const infoA = describeSegment(idA);
      const infoB = describeSegment(idB);
      if (!infoA || !infoB) {
        return `I could not find ${!infoA ? idA : idB} in this dataset.`;
      }
      const describe = (id: string, info: NonNullable<ReturnType<typeof describeSegment>>) => {
        const properties = info.feature.properties;
        const state = info.telemetry
          ? `${info.telemetry.status} at ${Math.round(info.telemetry.utilization * 100)}% capacity, ${info.telemetry.trend}`
          : "within normal simulated range";
        return `${id} (${properties.type.toLowerCase()}, ${formatDistance(properties.lengthMeters)}) is ${state}`;
      };
      onSelect(idA);
      return `${describe(idA, infoA)}. ${describe(idB, infoB)}.`;
    }

    const idMatch = text.match(/\b(pri|sec|ter)[-\s]?(\d{1,4})\b/i);
    if (idMatch) {
      const id = `${idMatch[1].toUpperCase()}-${idMatch[2].padStart(4, "0")}`;
      const info = describeSegment(id);
      if (info) {
        onSelect(id);
        const base = `I found ${id} and focused it on the map. It is a ${info.feature.properties.type.toLowerCase()} drain measuring ${formatDistance(info.feature.properties.lengthMeters)}.`;
        if (!info.telemetry) {
          return `${base} It is currently within normal simulated range, not on watch or critical.`;
        }
        return `${base} It is currently ${info.telemetry.status} at ${Math.round(info.telemetry.utilization * 100)}% simulated capacity, ${info.telemetry.trend}.`;
      }
      return `I could not find ${id} in this dataset. IDs run as PRI, SEC, or TER followed by four digits.`;
    }

    if (/upstream|downstream|neighbor|connected segments/.test(text)) {
      if (!selectedFeature) {
        return "Select a segment first, then ask about its upstream or downstream neighbors.";
      }
      const upstream = snapshot?.upstreamIds ?? [];
      const downstream = snapshot?.downstreamIds ?? [];
      if (upstream.length === 0 && downstream.length === 0) {
        return `${selectedFeature.properties.id} has no snapped neighbors in the endpoint graph.`;
      }
      const parts: string[] = [];
      if (upstream.length > 0) parts.push(`upstream: ${upstream.join(", ")}`);
      if (downstream.length > 0) parts.push(`downstream: ${downstream.join(", ")}`);
      return `${selectedFeature.properties.id} neighbors, ${parts.join("; ")}. Direction is estimated from drain hierarchy and deterministic topology scoring, not surveyed flow direction.`;
    }

    const rankMatch = text.match(/top\s*(\d{1,2})|worst\s*(\d{1,2})/);
    if (rankMatch || /list critical|list risk|which segments|rank/.test(text)) {
      const requested = Number(rankMatch?.[1] ?? rankMatch?.[2] ?? 5);
      const count = Math.max(1, Math.min(8, Number.isFinite(requested) ? requested : 5));
      const list = (snapshot?.topRisks ?? []).slice(0, count);
      if (list.length === 0) {
        return "The simulation is still preparing the network graph.";
      }
      onSelect(list[0].id);
      const summary = list
        .map((telemetry) => `${telemetry.id} ${Math.round(telemetry.utilization * 100)}% (${telemetry.status})`)
        .join(", ");
      return `Top ${list.length} by simulated capacity: ${summary}. Focused ${list[0].id}.`;
    }

    if (/block|clog|obstruction|choke/.test(text)) {
      const target = selectedFeature?.properties.id ?? defaultBlockageId;
      if (!target) return "Select a segment first so I know where to inject the blockage.";
      onStartScenario("blockage", target);
      onSelect(target);
      return `Blockage scenario started at ${target}. I set rainfall to 34 mm/hr and will track capacity propagation across its snapped network neighbors.`;
    }

    if (/cloudburst|heavy rain|severe storm|monsoon burst|start storm/.test(text)) {
      onStartScenario("cloudburst");
      return "Cloudburst started at 72 mm/hr. The storm cell will ramp over central Bengaluru and propagate load from tertiary drains into higher-order channels.";
    }

    if (/reset|baseline|normal conditions|clear scenario|stop scenario/.test(text)) {
      onStartScenario("normal");
      return "The network is back on the nominal 8 mm/hr monsoon baseline. Simulated blockage and accumulated scenario time were cleared.";
    }

    const rainMatch = text.match(/(?:rain|rainfall|intensity)[^\d]*(\d{1,3})/);
    if (rainMatch) {
      const rainfall = Math.min(100, Number(rainMatch[1]));
      onSetRainfall(rainfall);
      return `Rainfall is now ${rainfall} mm/hr. The worker is recalculating local runoff and segment utilization.`;
    }

    if (/pause|hold/.test(text)) {
      onSetRunning(false);
      return "Simulation paused. The current network state and scenario time are frozen.";
    }

    if (/resume|continue|play/.test(text)) {
      onSetRunning(true);
      return "Simulation resumed from the current scenario time.";
    }

    const speedMatch = text.match(/(?:speed|run)[^\d]*([124])\s*x?/);
    if (speedMatch) {
      const speed = Number(speedMatch[1]) as 1 | 2 | 4;
      onSetSpeed(speed);
      return `Simulation speed is now ${speed}x.`;
    }

    if (/show|filter|only/.test(text)) {
      const categories = dataset.metadata.categories;
      if (/primary/.test(text)) {
        onShowType("Primary");
        return `Showing only the ${categories.Primary.count.toLocaleString("en-IN")} primary drains. These are the highest-capacity channels in the source hierarchy.`;
      }
      if (/secondary/.test(text)) {
        onShowType("Secondary");
        return `Showing only the ${categories.Secondary.count.toLocaleString("en-IN")} secondary drains.`;
      }
      if (/tertiary/.test(text)) {
        onShowType("Tertiary");
        return `Showing only the ${categories.Tertiary.count.toLocaleString("en-IN")} tertiary drains, where localized overload tends to appear first.`;
      }
      if (/all|everything|network/.test(text)) {
        onShowType(null);
        return "All primary, secondary, and tertiary drains are visible again.";
      }
    }

    if (/why|explain|this drain|this segment|selected/.test(text)) {
      return segmentExplanation();
    }

    if (/what needs|attention|status|risk|critical|hotspot|problem/.test(text)) {
      const metrics = snapshot?.metrics;
      const top = snapshot?.topRisks[0];
      if (!metrics || !top) return "The simulation is still preparing the network graph.";
      if (metrics.criticalCount === 0 && metrics.watchCount === 0) {
        return `The network is stable. Average modeled utilization is ${Math.round(metrics.averageUtilization * 100)}%, with no segments above watch threshold.`;
      }
      onSelect(top.id);
      return `${metrics.criticalCount.toLocaleString("en-IN")} segments are critical, ${metrics.watchCount.toLocaleString("en-IN")} are on watch, and ${metrics.overflowCount.toLocaleString("en-IN")} exceed modeled capacity. I focused ${top.id}, the current highest-risk segment at ${Math.round(top.utilization * 100)}%.`;
    }

    if (/overflow|flood/.test(text)) {
      const metrics = snapshot?.metrics;
      if (!metrics) return "The simulation is still calculating overflow exposure.";
      return `${metrics.overflowCount.toLocaleString("en-IN")} segments currently exceed modeled capacity, affecting ${formatDistance(metrics.impactedLengthMeters)} of the mapped network. These are screening indicators, not flood forecasts.`;
    }

    if (/data|source|real|how many|length|coverage|dataset/.test(text)) {
      const primary = dataset.metadata.categories.Primary;
      const secondary = dataset.metadata.categories.Secondary;
      const tertiary = dataset.metadata.categories.Tertiary;
      return `The GIS layer is real OpenCity / BBMP data: ${dataset.metadata.totalFeatures.toLocaleString("en-IN")} segments and ${formatDistance(dataset.metadata.totalLengthMeters)} total recorded length. That includes ${primary.count} primary, ${secondary.count} secondary, and ${tertiary.count.toLocaleString("en-IN")} tertiary segments. Rainfall, capacity, and water levels are clearly labeled simulated telemetry.`;
    }

    if (/rain|weather|intensity/.test(text)) {
      return `Current scenario rainfall is ${Math.round(config.rainfallMmHr)} mm/hr. Say "set rainfall to 55" to change it.`;
    }

    return "I did not map that to an operation. Try asking what needs attention, list top 5, show upstream neighbors, compare two drain IDs, explain this segment, start a cloudburst, or set rainfall to 60.";
  }

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || thinking) return;
    messageId.current += 1;
    setMessages((current) => [
      ...current,
      { id: messageId.current, role: "user", text: trimmed },
    ]);
    setInput("");
    setThinking(true);
    const response = responseFor(trimmed);
    window.setTimeout(() => {
      messageId.current += 1;
      setMessages((current) => [
        ...current,
        { id: messageId.current, role: "assistant" as const, text: response },
      ].slice(-24));
      setThinking(false);
    }, 280);
  }

  if (!open) {
    return (
      <button type="button" className="assistant-launcher" onClick={() => setOpen(true)}>
        <span className="assistant-orb" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 2c.8 5.2 3.2 8.2 8 9-4.8.8-7.2 3.8-8 9-.8-5.2-3.2-8.2-8-9 4.8-.8 7.2-3.8 8-9Z" />
          </svg>
        </span>
        <span>
          <strong>Flow Assist</strong>
          <small>Ask or operate</small>
        </span>
      </button>
    );
  }

  return (
    <aside className="assistant-card" aria-label="Flow Assist">
      <header className="assistant-head">
        <span className="assistant-orb" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 2c.8 5.2 3.2 8.2 8 9-4.8.8-7.2 3.8-8 9-.8-5.2-3.2-8.2-8-9 4.8-.8 7.2-3.8 8-9Z" />
          </svg>
        </span>
        <div>
          <strong>Flow Assist</strong>
          <span><i /> Local operational AI</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Minimize Flow Assist">
          -
        </button>
      </header>

      <div className="assistant-messages" ref={scrollRef}>
        {messages.map((message) => (
          <div key={message.id} className={`assistant-message ${message.role}`}>
            {message.role === "assistant" && <span className="message-spark">+</span>}
            <p>{message.text}</p>
          </div>
        ))}
        {thinking && (
          <div className="assistant-message assistant thinking">
            <span className="message-spark">+</span>
            <p><i /><i /><i /></p>
          </div>
        )}
      </div>

      <div className="assistant-starters">
        {STARTERS.map((starter) => (
          <button type="button" key={starter} onClick={() => submit(starter)}>
            {starter}
          </button>
        ))}
      </div>

      <form
        className="assistant-input"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about risk or run a scenario..."
          aria-label="Message Flow Assist"
        />
        <button type="submit" disabled={!input.trim() || thinking} aria-label="Send message">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12 14-7-4.8 14-2.7-5.5L5 12Z" />
          </svg>
        </button>
      </form>
      <footer>Keyword intent engine | Runs entirely in your browser</footer>
    </aside>
  );
}



