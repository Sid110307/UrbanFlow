import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app import gemini_client, graph, risk
from app.config import settings
from app.models import Drain, Incident, TelemetryReading
from app.simulator import BASELINE, active_blockage_class
from app.websocket import manager

DEBRIS_IMAGE_MIME = "image/png"


def _local_trigger(reading):
    return (
        reading["water_level_cm"] > BASELINE["water_level_cm"] * 1.25
        or reading["flow_velocity_mps"] < BASELINE["flow_velocity_mps"] * 0.6
        or reading["turbidity_ntu"] > BASELINE["turbidity_ntu"] * 1.4
    )


def _latest_reading(session, drain_id):
    stmt = (
        select(TelemetryReading)
        .where(TelemetryReading.drain_id == drain_id)
        .order_by(TelemetryReading.timestamp.desc())
        .limit(1)
    )
    return session.scalars(stmt).first()


def _neighbor_summary(session, drain_id):
    neighbor_ids = graph.neighbors_of(drain_id)
    if not neighbor_ids:
        return "no connected neighbor nodes"
    parts = []
    for nid in neighbor_ids:
        latest = _latest_reading(session, nid)
        node = session.get(Drain, nid)
        name = node.name if node else nid
        if latest:
            parts.append(
                f"{name} ({nid}): water_level={latest.water_level_cm:.0f}cm "
                f"flow_velocity={latest.flow_velocity_mps:.2f}m/s"
            )
        else:
            parts.append(f"{name} ({nid}): no data yet")
    return "; ".join(parts)


async def evaluate_drain(session, drain_id, reading):
    now = datetime.now(timezone.utc)
    row = TelemetryReading(drain_id=drain_id, timestamp=now, **reading)
    session.add(row)
    session.commit()

    drain = session.get(Drain, drain_id)

    if not _local_trigger(reading):
        drain.status = "green"
        drain.updated_at = now
        session.commit()
        return {
            "type": "telemetry",
            "drain_id": drain_id,
            "reading": reading,
            "status": "green",
        }

    baseline = BASELINE
    neighbor_summary = _neighbor_summary(session, drain_id)

    classification = await asyncio.to_thread(
        gemini_client.classify_drain_anomaly,
        drain_id,
        drain.name,
        reading,
        baseline,
        neighbor_summary,
    )

    debris_class = confidence = rationale = image_url = None
    if classification.trigger_visual_triage:
        true_class = active_blockage_class(drain_id) or "silt"
        image_path = settings.debris_images_dir / f"{true_class}.png"
        image_bytes = image_path.read_bytes()
        image_url = f"/media/{true_class}.png"
        vision = await asyncio.to_thread(
            gemini_client.classify_debris, image_bytes, DEBRIS_IMAGE_MIME
        )
        debris_class, confidence, rationale = (
            vision.debris_class,
            vision.confidence,
            vision.rationale,
        )

    graph_narrative = await asyncio.to_thread(
        gemini_client.compose_graph_narrative,
        drain.name,
        neighbor_summary,
        classification.classification,
    )

    risk_level = risk.classify_risk(classification.classification, classification.blockage_probability)

    dispatch_text = alert_text = None
    if risk_level in ("yellow", "red") and classification.trigger_visual_triage:
        dispatch_text = await asyncio.to_thread(
            risk.build_dispatch_text, drain.name, debris_class or "unknown", confidence or 0.0, risk_level
        )
        alert_text = await asyncio.to_thread(risk.build_citizen_alert, drain.name, risk_level)

    incident = Incident(
        drain_id=drain_id,
        timestamp=now,
        classification=classification.classification,
        blockage_probability=classification.blockage_probability,
        reasoning=classification.reasoning,
        trigger_visual_triage=classification.trigger_visual_triage,
        debris_class=debris_class,
        debris_confidence=confidence,
        debris_rationale=rationale,
        camera_image_path=image_url,
        graph_narrative=graph_narrative,
        risk_level=risk_level,
        dispatch_text=dispatch_text,
        alert_text=alert_text,
    )
    session.add(incident)
    drain.status = risk_level
    drain.updated_at = now
    session.commit()
    session.refresh(incident)

    return {
        "type": "incident",
        "drain_id": drain_id,
        "reading": reading,
        "status": risk_level,
        "incident": {
            "id": incident.id,
            "classification": incident.classification,
            "blockage_probability": incident.blockage_probability,
            "reasoning": incident.reasoning,
            "trigger_visual_triage": incident.trigger_visual_triage,
            "debris_class": incident.debris_class,
            "debris_confidence": incident.debris_confidence,
            "debris_rationale": incident.debris_rationale,
            "camera_image_path": incident.camera_image_path,
            "graph_narrative": incident.graph_narrative,
            "risk_level": incident.risk_level,
            "dispatch_text": incident.dispatch_text,
            "alert_text": incident.alert_text,
            "timestamp": now.isoformat(),
        },
    }


async def on_tick(session_factory, drain_id, reading):
    session = session_factory()
    try:
        event = await evaluate_drain(session, drain_id, reading)
    finally:
        session.close()
    await manager.broadcast(event)
