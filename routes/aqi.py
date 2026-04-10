import asyncio

from fastapi import APIRouter, Query, Request, Response, HTTPException
from models.schemas import AQIResponse
from services import (
    cache,
    clean_measurement,
    compute_overall_aqi,
    extract_country,
    fetch_latest_by_city,
    fetch_measurements,
)
from limiter import limiter
from logger import get_logger

router = APIRouter(tags=["AQI"])
log = get_logger("routes.aqi")


@router.get("/aqi", response_model=AQIResponse, summary="Current AQI for a city")
@limiter.limit("30/minute")
async def get_aqi(
    request: Request,
    response: Response,
    city: str = Query(..., description="City name, e.g. Delhi"),
):
    """
    Returns the current Air Quality Index (AQI) for the specified city,
    calculated using the US EPA formula. Cached for 15 minutes.
    """
    cache_key = f"aqi:{city.lower()}"
    cached = cache.get(cache_key)
    if cached:
        log.debug("aqi_cache_hit", city=city)
        return cached

    log.info("aqi_fetch", city=city)
    locations = await fetch_latest_by_city(city)

    # Only use locations with confirmed recent data to avoid rate limiting
    active_locations = [
        loc for loc in locations
        if loc.get("datetimeLast") is not None
    ][:3]

    if not active_locations:
        active_locations = locations[:2]

    country = extract_country(active_locations[0]) if active_locations else "??"

    all_measurements = []
    last_updated = None

    raw_results = await asyncio.gather(
        *[
            fetch_measurements(loc, None, limit=5)
            for loc in active_locations
        ],
        return_exceptions=True,
    )

    for loc, raw_result in zip(active_locations, raw_results):
        if isinstance(raw_result, Exception):
            log.warning(
                "aqi_measurement_fetch_failed",
                city=city,
                location_id=loc.get("id"),
                error=str(raw_result),
            )
            continue

        if not raw_result:
            continue

        for raw_measurement in raw_result:
            parameter = raw_measurement.get("parameter", "").lower()
            if not parameter:
                continue

            m = clean_measurement({
                "parameter": parameter,
                "value": raw_measurement.get("value"),
                "unit": raw_measurement.get("unit", "µg/m³"),
                "lastUpdated": raw_measurement.get("lastUpdated"),
            })
            if not m:
                continue

            all_measurements.append(m)
            if m.last_updated and (last_updated is None or m.last_updated > last_updated):
                last_updated = m.last_updated

    # Keep only the highest reading per parameter for AQI calculation
    param_map: dict[str, dict] = {}
    for m in all_measurements:
        existing = param_map.get(m.parameter)
        if existing is None or m.value > existing["value"]:
            param_map[m.parameter] = {"parameter": m.parameter, "value": m.value}

    aqi_val, category, dominant = compute_overall_aqi(list(param_map.values()))
    log.info("aqi_calculated", city=city, aqi=aqi_val, category=category, dominant=dominant)

    result = AQIResponse(
        city=city,
        country=country,
        aqi=aqi_val,
        category=category,
        dominant_pollutant=dominant,
        measurements=all_measurements,
        last_updated=last_updated,
    )
    cache.set(cache_key, result)
    return result