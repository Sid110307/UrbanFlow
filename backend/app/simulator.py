import asyncio
import random
from dataclasses import dataclass

from app import graph
from app.config import settings

BASELINE = {
    "water_level_cm": 28.0,
    "flow_velocity_mps": 0.55,
    "turbidity_ntu": 90.0,
    "precip_rate_mm_hr": 1.0,
}


@dataclass
class Injection:
    rain_ticks_remaining: int = 0
    rain_intensity: float = 0.0
    blockage_debris_class: str | None = None


_injections = {drain_id: Injection() for drain_id in graph.all_drain_ids()}

RAIN_DURATION_TICKS = 8


def inject_rain(drain_id, precip_rate_mm_hr):
    inj = _injections.setdefault(drain_id, Injection())
    inj.rain_ticks_remaining = RAIN_DURATION_TICKS
    inj.rain_intensity = precip_rate_mm_hr
    # rain affects the whole upstream sub-network a little, like real weather
    for up in graph.upstream_of(drain_id):
        up_inj = _injections.setdefault(up, Injection())
        up_inj.rain_ticks_remaining = RAIN_DURATION_TICKS
        up_inj.rain_intensity = precip_rate_mm_hr * 0.7


def inject_blockage(drain_id, debris_class):
    inj = _injections.setdefault(drain_id, Injection())
    inj.blockage_debris_class = debris_class


def clear_drain(drain_id):
    _injections[drain_id] = Injection()


def _tick_drain(drain_id):
    inj = _injections.setdefault(drain_id, Injection())

    reading = {
        "water_level_cm": BASELINE["water_level_cm"] + random.uniform(-2, 2),
        "flow_velocity_mps": BASELINE["flow_velocity_mps"] + random.uniform(-0.05, 0.05),
        "turbidity_ntu": BASELINE["turbidity_ntu"] + random.uniform(-10, 10),
        "precip_rate_mm_hr": max(0.0, BASELINE["precip_rate_mm_hr"] + random.uniform(-0.5, 0.5)),
        "upstream_precip_mm_hr": 0.0,
    }

    if inj.rain_ticks_remaining > 0:
        reading["precip_rate_mm_hr"] = inj.rain_intensity + random.uniform(-3, 3)
        reading["water_level_cm"] += inj.rain_intensity * 0.6
        reading["flow_velocity_mps"] += inj.rain_intensity * 0.01  # rain raises velocity
        reading["turbidity_ntu"] += inj.rain_intensity * 1.5
        inj.rain_ticks_remaining -= 1

    if inj.blockage_debris_class:
        reading["water_level_cm"] += 35.0
        reading["flow_velocity_mps"] = max(0.02, reading["flow_velocity_mps"] * 0.08)
        reading["turbidity_ntu"] += 260.0

    reading["upstream_precip_mm_hr"] = max(
        (
            _injections.get(up, Injection()).rain_intensity
            if _injections.get(up, Injection()).rain_ticks_remaining > 0
            else 0.0
        )
        for up in (graph.upstream_of(drain_id) or [drain_id])
    ) if graph.upstream_of(drain_id) else reading["precip_rate_mm_hr"]

    return reading


def active_blockage_class(drain_id):
    return _injections.get(drain_id, Injection()).blockage_debris_class


async def run_forever(on_tick):
    while True:
        for drain_id in graph.all_drain_ids():
            reading = _tick_drain(drain_id)
            await on_tick(drain_id, reading)
        await asyncio.sleep(settings.sim_interval_seconds)
