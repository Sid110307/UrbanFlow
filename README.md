# UrbanFlow

UrbanFlow is an atlas of Bengaluru's mapped stormwater drain network, built
around an evidence-gated, self-healing agentic pipeline for Silk Board
Junction. A single sensor reading, say 94cm of water, can mean two opposite
emergencies: a cloudburst clearing itself in twenty minutes, or a physical
choke about to flood an underpass for hours. UrbanFlow's Silk Board pipeline
never trusts one signal. It reads 15-second hydrodynamic chunks, runs causal
disambiguation through Gemini, and cross-checks the result against live
camera evidence before anything gets dispatched, with five zero-trust
evidence gates holding veto power over every step: a flatlined sensor is
reconstructed from inlet backpressure, a stalled Gemini call falls back to a
deterministic heuristic in milliseconds, a dead camera reroutes triage to its
neighbor, and a hallucinated "normal runoff" gets caught and overridden the
moment it contradicts the physical flow data.

On top of that, UrbanFlow renders the OpenCity / BBMP dataset for
Bengaluru's wider drain network as searchable primary, secondary, and
tertiary linework with source metadata for every segment, adds browser-based
rainfall, cloudburst, and blockage scenarios, a 3D interactive map with
real-time risk-height visualization, live risk overlays, a propagation
timeline, and Flow Assist, an AI operations assistant.

## Run locally

```powershell
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:5173.

## Flow Assist

Flow Assist handles scenario commands, lookups, and comparisons instantly
with built-in logic, and falls back to a real Gemini function-calling agent
for open-ended questions, letting the model chain tool calls against live
app state (selecting segments, running scenarios, reading network status)
before answering.

## Prod build

```powershell
cd frontend
pnpm build
pnpm preview
```

## Data

The checked-in frontend/public/data/drains.json file is the web-optimized static
dataset used by the app. To regenerate it from the public KML:

```powershell
cd frontend
pnpm build:data
```

The source is OpenCity's [Bengaluru Stormwater Drains Maps](https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps),
credited to BBMP and published under the dataset's public-domain license.

## License

> [MIT](https://opensource.org/licenses/MIT)
