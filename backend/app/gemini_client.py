from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.config import settings

_client = genai.Client(api_key=settings.gemini_api_key)


class AnomalyClassification(BaseModel):
    classification: str = Field(
        description="one of: normal_runoff, probable_blockage, confirmed_blockage"
    )
    blockage_probability: float = Field(ge=0, le=100)
    reasoning: str
    trigger_visual_triage: bool


class DebrisClassification(BaseModel):
    debris_class: str = Field(
        description="one of: plastic, silt, construction_debris, none"
    )
    confidence: float = Field(ge=0, le=100)
    rationale: str


def classify_drain_anomaly(drain_id, drain_name, current, baseline, neighbor_summary):
    prompt = f"""You are the causal-disambiguation module of DrainGuard, a stormwater
monitoring system for Bengaluru. Given live and baseline telemetry for drain node
"{drain_name}" ({drain_id}), decide whether the current reading pattern is explained
by rainfall runoff or indicates a physical blockage (debris/silt/construction waste).

Current reading: {current}
Recent baseline (typical for this node): {baseline}
Upstream/downstream neighbor context: {neighbor_summary}

Key signal: rising water level + falling/stagnant flow velocity + high turbidity that
is NOT matched by a proportional rainfall spike is a strong blockage signal. If the
neighboring nodes are elevated in the same way, it's more likely rain-wide runoff;
if this node is anomalous in isolation, it's more likely a local physical blockage.

Return blockage_probability 0-100 and a one-to-two sentence reasoning string suitable
for display to a control-room operator. Set trigger_visual_triage true only if
blockage_probability >= {settings.blockage_trigger_threshold}."""

    response = _client.models.generate_content(
        model=settings.gemini_flash_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=AnomalyClassification,
        ),
    )
    return AnomalyClassification.model_validate_json(response.text)


def classify_debris(image_bytes, mime_type="image/png"):
    prompt = """You are the visual triage module of DrainGuard. This is a camera frame
from inside/above a stormwater drain that has been flagged as a probable blockage.
Classify the visible debris into exactly one of: plastic, silt, construction_debris, none.
Give a confidence 0-100 and a short rationale describing what you see."""

    response = _client.models.generate_content(
        model=settings.gemini_pro_model,
        contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type=mime_type)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=DebrisClassification,
        ),
    )
    return DebrisClassification.model_validate_json(response.text)


def compose_dispatch_text(drain_name, debris_class, confidence, risk_level):
    prompt = f"""Write a short (<40 words) crew dispatch message for a stormwater
maintenance team. Drain: {drain_name}. Detected debris: {debris_class}
({confidence:.0f}% confidence). Risk level: {risk_level}. Plain text, no markdown,
include what crew/equipment type is likely needed."""

    response = _client.models.generate_content(
        model=settings.gemini_flash_model,
        contents=prompt,
    )
    return response.text.strip()


def compose_citizen_alert(drain_name, risk_level):
    prompt = f"""Write a short (<30 words) SMS alert to a resident near drain
"{drain_name}" warning of possible waterlogging risk, risk level {risk_level}.
Plain, reassuring, actionable tone. No markdown."""

    response = _client.models.generate_content(
        model=settings.gemini_flash_model,
        contents=prompt,
    )
    return response.text.strip()


def compose_graph_narrative(drain_name, neighbor_summary, classification):
    prompt = f"""In one plain-language sentence, explain to a control-room operator why
the drain network graph context around "{drain_name}" supports a "{classification}"
call. Neighbor context: {neighbor_summary}. No markdown."""

    response = _client.models.generate_content(
        model=settings.gemini_flash_model,
        contents=prompt,
    )
    return response.text.strip()
