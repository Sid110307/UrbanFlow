from fastapi import APIRouter, HTTPException

from app import graph, simulator
from app.schemas import InjectBlockageRequest, InjectRainRequest

router = APIRouter(prefix="/api/control", tags=["control"])

VALID_DEBRIS = {"plastic", "silt", "construction_debris"}


def _require_known_drain(drain_id):
    if drain_id not in graph.all_drain_ids():
        raise HTTPException(status_code=404, detail="unknown drain_id")


@router.post("/rain")
def inject_rain(body: InjectRainRequest):
    _require_known_drain(body.drain_id)
    simulator.inject_rain(body.drain_id, body.precip_rate_mm_hr)
    return {"ok": True}


@router.post("/blockage")
def inject_blockage(body: InjectBlockageRequest):
    _require_known_drain(body.drain_id)
    if body.debris_class not in VALID_DEBRIS:
        raise HTTPException(status_code=400, detail=f"debris_class must be one of {VALID_DEBRIS}")
    simulator.inject_blockage(body.drain_id, body.debris_class)
    return {"ok": True}


@router.post("/clear/{drain_id}")
def clear_drain(drain_id):
    _require_known_drain(drain_id)
    simulator.clear_drain(drain_id)
    return {"ok": True}
