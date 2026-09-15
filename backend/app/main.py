import asyncio
from contextlib import asynccontextmanager
from functools import partial

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import agent, graph, simulator
from app.config import settings
from app.database import SessionLocal, init_db
from app.models import Drain
from app.routes import control, drains, incidents, ws


def _seed_drains():
    session = SessionLocal()
    try:
        existing = {d.drain_id for d in session.query(Drain).all()}
        for drain_id, name, lat, lon in graph.drain_seed():
            if drain_id not in existing:
                session.add(Drain(drain_id=drain_id, name=name, lat=lat, lon=lon, status="green"))
        session.commit()
    finally:
        session.close()


@asynccontextmanager
async def lifespan(app):
    init_db()
    _seed_drains()
    sim_task = asyncio.create_task(
        simulator.run_forever(partial(agent.on_tick, SessionLocal))
    )
    yield
    sim_task.cancel()


app = FastAPI(title="DrainGuard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(drains.router)
app.include_router(incidents.router)
app.include_router(control.router)
app.include_router(ws.router)

app.mount("/media", StaticFiles(directory=str(settings.debris_images_dir)), name="media")


@app.get("/api/health")
def health():
    return {"status": "ok", "gemini_key_configured": bool(settings.gemini_api_key)}
