from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app import graph
from app.database import get_session
from app.models import Drain, TelemetryReading
from app.schemas import DrainDetailOut, DrainOut, TelemetryOut

router = APIRouter(prefix="/api/drains", tags=["drains"])


@router.get("", response_model=list[DrainOut])
def list_drains(session=Depends(get_session)):
    return session.scalars(select(Drain)).all()


@router.get("/{drain_id}", response_model=DrainDetailOut)
def get_drain(drain_id, session=Depends(get_session)):
    drain = session.get(Drain, drain_id)
    if not drain:
        raise HTTPException(status_code=404, detail="drain not found")

    stmt = (
        select(TelemetryReading)
        .where(TelemetryReading.drain_id == drain_id)
        .order_by(TelemetryReading.timestamp.desc())
        .limit(40)
    )
    history = list(reversed(session.scalars(stmt).all()))
    latest = history[-1] if history else None

    return DrainDetailOut(
        drain_id=drain.drain_id,
        name=drain.name,
        lat=drain.lat,
        lon=drain.lon,
        status=drain.status,
        updated_at=drain.updated_at,
        latest_reading=TelemetryOut.model_validate(latest) if latest else None,
        history=[TelemetryOut.model_validate(r) for r in history],
        neighbors=graph.neighbors_of(drain_id),
    )
