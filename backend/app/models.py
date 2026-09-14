from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Drain(Base):
    __tablename__ = "drains"

    drain_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String, default="green")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    readings: Mapped[list["TelemetryReading"]] = relationship(back_populates="drain")
    incidents: Mapped[list["Incident"]] = relationship(back_populates="drain")


class TelemetryReading(Base):
    __tablename__ = "telemetry_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    drain_id: Mapped[str] = mapped_column(ForeignKey("drains.drain_id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    water_level_cm: Mapped[float] = mapped_column(Float)
    flow_velocity_mps: Mapped[float] = mapped_column(Float)
    turbidity_ntu: Mapped[float] = mapped_column(Float)
    precip_rate_mm_hr: Mapped[float] = mapped_column(Float)
    upstream_precip_mm_hr: Mapped[float] = mapped_column(Float)

    drain: Mapped["Drain"] = relationship(back_populates="readings")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    drain_id: Mapped[str] = mapped_column(ForeignKey("drains.drain_id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    classification: Mapped[str] = mapped_column(String)
    blockage_probability: Mapped[float] = mapped_column(Float)
    reasoning: Mapped[str] = mapped_column(Text)
    trigger_visual_triage: Mapped[bool] = mapped_column(Boolean, default=False)

    debris_class: Mapped[str | None] = mapped_column(String, nullable=True)
    debris_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    debris_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    camera_image_path: Mapped[str | None] = mapped_column(String, nullable=True)

    graph_narrative: Mapped[str | None] = mapped_column(Text, nullable=True)

    risk_level: Mapped[str] = mapped_column(String)
    dispatch_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    alert_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    drain: Mapped["Drain"] = relationship(back_populates="incidents")
