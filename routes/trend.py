from fastapi import APIRouter, Query, HTTPException
from models.schemas import TrendResponse, TrendPoint
from services import (
    cache, fetch_latest_by_city, fetch_measurements,
    calculate_aqi, get_category, parse_datetime,
)

router = APIRouter(tags=["Trend"])

PREFERRED_PARAMS = ["pm25", "pm10", "no2", "o3", "so2", "co"]


@router.get("/trend", response_model=TrendResponse, summary="AQI trend over last 24 readings")
async def get_trend(
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
        return cached

    locations = await fetch_latest_by_city(city)
    if not locations:
        raise HTTPException(404, f"No monitoring stations found for: {city}")

    # Use first location that has the requested parameter
    location_id = None
    unit = "µg/m³"

    for loc in locations:
        sensors = loc.get("sensors", []) or loc.get("parameters", [])
        for sensor in sensors:
            param = sensor.get("parameter", {})
            param_name = (param.get("name", "") if isinstance(param, dict) else str(param)).lower()
            if param_name == parameter.lower():
                location_id = loc.get("id")
                if isinstance(param, dict):
                    unit = param.get("units", "µg/m³")
                break
        if location_id:
            break

    if not location_id:
        raise HTTPException(
            404,
            f"No measurements for parameter '{parameter}' found in {city}. "
            f"Try one of: {', '.join(PREFERRED_PARAMS)}",
        )

    raw_measurements = await fetch_measurements(location_id, parameter, limit)

    trend_points: list[TrendPoint] = []
    for m in raw_measurements:
        value = m.get("value")
        ts_raw = m.get("date", {}).get("utc") or m.get("datetime", {}).get("utc")
        timestamp = parse_datetime(ts_raw)

        if value is None or value < 0 or timestamp is None:
            continue

        sub_aqi = calculate_aqi(parameter, float(value))
        if sub_aqi is None:
            continue

        trend_points.append(
            TrendPoint(timestamp=timestamp, aqi=sub_aqi, category=get_category(sub_aqi))
        )

    # Chronological order (oldest → newest)
    trend_points.sort(key=lambda p: p.timestamp)

    response = TrendResponse(city=city, parameter=parameter, unit=unit, trend=trend_points)
    cache.set(cache_key, response)
    return response