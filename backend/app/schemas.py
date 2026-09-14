from datetime import datetime

from pydantic import BaseModel


class TelemetryOut(BaseModel):
    timestamp: datetime
    water_level_cm: float
    flow_velocity_mps: float
    turbidity_ntu: float
    precip_rate_mm_hr: float
    upstream_precip_mm_hr: float

    class Config:
        from_attributes = True


class DrainOut(BaseModel):
    drain_id: str
    name: str
    lat: float
    lon: float
    status: str
    updated_at: datetime

    class Config:
        from_attributes = True


class DrainDetailOut(DrainOut):
    latest_reading: TelemetryOut | None
    history: list[TelemetryOut]
    neighbors: list[str]


class IncidentOut(BaseModel):
    id: int
    drain_id: str
    timestamp: datetime
    classification: str
    blockage_probability: float
    reasoning: str
    trigger_visual_triage: bool
    debris_class: str | None
    debris_confidence: float | None
    debris_rationale: str | None
    camera_image_path: str | None
    graph_narrative: str | None
    risk_level: str
    dispatch_text: str | None
    alert_text: str | None

    class Config:
        from_attributes = True


class InjectRainRequest(BaseModel):
    drain_id: str
    precip_rate_mm_hr: float = 45.0


class InjectBlockageRequest(BaseModel):
    drain_id: str
    debris_class: str = "construction_debris"
