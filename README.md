# UrbanFlow

UrbanFlow is a frontend-only atlas of Bengaluru's mapped stormwater drain
network. It renders the OpenCity / BBMP dataset as searchable primary,
secondary, and tertiary linework with source metadata for every segment. The
demo adds browser-based rainfall, cloudburst, and blockage scenarios, live risk
overlays, a propagation timeline, and a local keyword-driven operations
assistant.

## Run locally

~~~powershell
cd frontend
pnpm install
pnpm dev
~~~

Open http://localhost:5173. No API server, database, environment file, or
runtime data download is required.

## Production build

~~~powershell
cd frontend
pnpm build
pnpm preview
~~~

The checked-in frontend/public/data/drains.json file is the web-optimized static
dataset used by the app. To regenerate it from the public KML:

~~~powershell
cd frontend
pnpm build:data
~~~

The source is OpenCity's [Bengaluru Stormwater Drains Maps](https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps),
credited to BBMP and published under the dataset's public-domain license.

The mapped geometry, drain hierarchy, recorded lengths, and source identifiers
come from the public dataset. Rainfall, capacity, water level, flow, topology
direction, and incidents are deterministic demo telemetry and are labeled as
simulated in the interface.

Everything runs in the browser. The application does not need an API server,
database, Gemini key, environment file, or network connection after its static
assets and map tiles have loaded.

