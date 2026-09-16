# DrainGuard

Simulated Bengaluru stormwater drain network (10 nodes) with a Gemini-orchestrated
causal reasoning pipeline: rain vs. blockage disambiguation, debris vision triage,
graph-level reasoning across neighboring drains, and a live map dashboard. No
hardware, no cloud storage, no MQTT/Docker/Postgres, no WhatsApp/SMS delivery —
everything runs on your machine with SQLite and two local dev servers.

## 1. Backend setup

```
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env
```

Open `backend/.env` and paste your real Gemini API key (from Google AI Studio)
into `GEMINI_API_KEY`. The app requires a valid key — there is no offline/mock
mode by design (per project choice).

Generate the staged demo camera images once (already generated, re-run only if
you edit `scripts/generate_demo_images.py`):

```
python scripts/generate_demo_images.py
```

Run the API:

```
uvicorn app.main:app --reload --port 8000
```

On startup it seeds the 10-drain graph into `backend/drainguard.db` (SQLite,
git-ignored) and starts the background telemetry simulator — a tick every
`SIM_INTERVAL_SECONDS` (default 6s) for every drain.

## 2. Frontend setup

```
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:5173. Vite proxies `/api`, `/media`, and `/ws` to the
backend on port 8000.

## 3. Operating it

The simulator alone stays in the nominal (green) band — nothing gets sent to
Gemini until a reading crosses a local anomaly threshold, so you drive the
story with **Open controls**, which pops a separate window with:

- **Rain intensity slider (10–80mm/hr)** — low end stays under the anomaly
  threshold (no Gemini call at all), high end clearly crosses it. Gemini
  should classify a rain-only spike as `normal_runoff`: water level and
  turbidity rise but flow velocity rises too (rain-driven runoff signature).
- **Inject plastic / silt / construction debris** — water level rises while
  flow velocity collapses toward stagnant and turbidity spikes (no matching
  rain). Gemini should classify this as `probable_blockage` /
  `confirmed_blockage`, trigger visual triage against a staged camera frame,
  and (if risk is advisory/critical) generate a crew dispatch message and a
  citizen SMS alert — both shown in the drain detail modal, not sent anywhere.
- **Clear / reset drain** — removes the injected condition; it settles back to
  baseline over the next few ticks.

Click any pin on the map to open the drain detail modal: live telemetry
chart, Gemini's raw reasoning string, graph context narrative, debris
classification + confidence, and the dispatch/alert text. The sidebar's
**Reasoning log** lists every incident across the network in real time over
WebSocket.

## 4. What was deliberately cut from the original architecture doc

See `docs/ARCHITECTURE.md` for the full reasoning. Short version: no hardware
rig, no MQTT broker (simulator calls the backend in-process), no Docker/
Postgres/PostGIS/TimescaleDB (SQLite is plenty for 10 nodes), no 3D digital
twin, no real WhatsApp/SMS delivery (dispatch/alert text is generated and
displayed, not sent), no S3/GCS (staged demo images live in
`backend/assets/debris_images/`).

## 5. Troubleshooting

- **Map pins never turn yellow/red**: check `backend` terminal output — if
  Gemini calls are failing (bad key, no quota), each failure is logged and
  that tick is skipped, but the drain stays green. Fix the key/quota and the
  next injected event will pick it up on the following tick.
- **`GEMINI_API_KEY` errors on startup**: the app fails fast if the key is
  missing/invalid the moment it tries a Gemini call, not at process start —
  watch the backend log after triggering an injection.
