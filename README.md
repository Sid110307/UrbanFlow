# UrbanFlow

UrbanFlow is an atlas of Bengaluru's mapped stormwater drain
network. It renders the OpenCity / BBMP dataset as searchable primary,
secondary, and tertiary linework with source metadata for every segment. On
top of that it adds browser-based rainfall, cloudburst, and blockage
scenarios, a 3D interactive map with real-time risk-height visualization,
live risk overlays, a propagation timeline, and Flow Assist, an AI
operations assistant.

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
