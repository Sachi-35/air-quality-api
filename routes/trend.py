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

    if not target_location:
        raise HTTPException(
            404,
            f"No measurements for '{parameter}' in {city}. "
            f"Try: {', '.join(PREFERRED_PARAMS)}",
        )

    raw_measurements = await fetch_measurements(target_location, parameter, limit)

    trend_points: list[TrendPoint] = []
    for m in raw_measurements:
        value = m.get("value")
        timestamp = parse_datetime(m.get("lastUpdated"))  # new format uses lastUpdated

        if value is None or value < 0 or timestamp is None:
            continue
        sub_aqi = calculate_aqi(parameter, float(value))
        if sub_aqi is None:
            continue
        trend_points.append(
            TrendPoint(timestamp=timestamp, aqi=sub_aqi, category=get_category(sub_aqi))
        )

    result = TrendResponse(
        city=city,
        parameter=parameter,
        unit=unit,
        trend=trend_points,
    )
    cache.set(cache_key, result)
    return result