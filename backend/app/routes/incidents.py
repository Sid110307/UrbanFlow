from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.database import get_session
from app.models import Incident
from app.schemas import IncidentOut

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=list[IncidentOut])
def list_incidents(limit: int = 50, drain_id=None, session=Depends(get_session)):
    stmt = select(Incident).order_by(Incident.timestamp.desc()).limit(limit)
    if drain_id:
        stmt = stmt.where(Incident.drain_id == drain_id)
    return session.scalars(stmt).all()
