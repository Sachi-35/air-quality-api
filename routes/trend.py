from fastapi import APIRouter, Query, Request, Response, HTTPException
from models.schemas import TrendResponse, TrendPoint
from services import (
    cache, fetch_latest_by_city, fetch_measurements,
    calculate_aqi, get_category, parse_datetime,
)
from limiter import limiter
from logger import get_logger

router = APIRouter(tags=["Trend"])
log = get_logger("routes.trend")

PREFERRED_PARAMS = ["pm25", "pm10", "no2", "o3", "so2", "co"]


@router.get("/trend", response_model=TrendResponse, summary="AQI trend over last N readings")
@limiter.limit("20/minute")
async def get_trend(
    request: Request,
    response: Response,
    city: str = Query(..., description="City name, e.g. Delhi"),
    parameter: str = Query("pm25", description="Pollutant parameter"),
    limit: int = Query(24, ge=1, le=100, description="Number of readings"),
):
    """
    Returns historical AQI readings for a city to show the trend over time.
    Uses the first monitoring station found for that city. Cached for 15 minutes.

    FIX: Returns an empty trend list (not 404) when the city exists but has no
    historical data for the requested parameter. The frontend should show an
    empty-state message rather than crashing on a 404.
    """
    cache_key = f"trend:{city.lower()}:{parameter}:{limit}"
    cached = cache.get(cache_key)
    if cached:
        log.debug("trend_cache_hit", city=city, parameter=parameter)
        return cached

    log.info("trend_fetch", city=city, parameter=parameter, limit=limit)
    locations = await fetch_latest_by_city(city)
    if not locations:
        raise HTTPException(404, f"No monitoring stations found for: {city}")

    # Find the first location that has the requested parameter
    target_location = None
    unit = "µg/m³"

    for loc in locations:
        sensors = loc.get("sensors", []) or loc.get("parameters", [])
        for sensor in sensors:
            param = sensor.get("parameter", {})
            param_name = (
                param.get("name", "") if isinstance(param, dict) else str(param)
            ).lower()
            if param_name == parameter.lower():
                target_location = loc
                if isinstance(param, dict):
                    unit = param.get("units", "µg/m³")
                break
        if target_location:
            break

    # FIX: Instead of raising 404, return an empty trend with a hint about
    # which parameters are available for this city.
    if not target_location:
        available = _available_params(locations)
        log.warning(
            "trend_no_parameter",
            city=city,
            parameter=parameter,
            available=available,
        )
        result = TrendResponse(
            city=city,
            parameter=parameter,
            unit=unit,
            trend=[],
            message=(
                f"No '{parameter}' sensor found in {city}. "
                f"Available: {', '.join(available) or 'none detected'}"
            ),
        )
        # Cache the empty result for a shorter period (5 min) to avoid
        # hammering OpenAQ for parameters that genuinely don't exist.
        cache.set(cache_key, result, ttl=300)
        return result

    raw_measurements = await fetch_measurements(target_location, parameter, limit)

    trend_points: list[TrendPoint] = []
    for m in raw_measurements:
        value = _extract_value(m)
        # FIX: lastUpdated in v3 responses can be a dict — parse_datetime now
        # handles both string and dict forms (see preprocessor.py fix).
        timestamp = parse_datetime(
            m.get("lastUpdated") or m.get("date")
        )

        if value is None or value < 0 or timestamp is None:
            continue
        sub_aqi = calculate_aqi(parameter, float(value))
        if sub_aqi is None:
            continue
        trend_points.append(
            TrendPoint(timestamp=timestamp, aqi=sub_aqi, category=get_category(sub_aqi))
        )

    # Sort chronologically (oldest → newest) so charts render correctly
    trend_points.sort(key=lambda p: p.timestamp)

    if not trend_points:
        log.warning("trend_empty_after_parse", city=city, parameter=parameter,
                    raw_count=len(raw_measurements))

    result = TrendResponse(
        city=city,
        parameter=parameter,
        unit=unit,
        trend=trend_points,
        message=None if trend_points else (
            f"Station found but no valid '{parameter}' readings returned by OpenAQ. "
            "This is common for less-monitored cities. Try a different parameter."
        ),
    )
    cache.set(cache_key, result)
    return result


# ── helpers ──────────────────────────────────────────────────────────────────

def _available_params(locations: list[dict]) -> list[str]:
    """Collect all parameter names across all locations."""
    seen = set()
    for loc in locations:
        sensors = loc.get("sensors", []) or loc.get("parameters", [])
        for sensor in sensors:
            param = sensor.get("parameter", {})
            name = (param.get("name", "") if isinstance(param, dict) else str(param)).lower()
            if name:
                seen.add(name)
    return sorted(seen)


def _extract_value(m: dict) -> float | None:
    """
    Extract concentration value from a raw measurement dict.
    OpenAQ v3 /measurements responses nest the value under m["value"] directly,
    but some endpoints wrap it under m["summary"]["avg"] or m["value"]["avg"].
    """
    value = m.get("value")
    if isinstance(value, dict):
        # v3 summary object: pick average, falling back to min
        value = value.get("avg") or value.get("min")
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None