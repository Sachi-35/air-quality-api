from fastapi import APIRouter, Query
from models.schemas import AQIResponse
from services import (
    cache, fetch_latest_by_city, extract_measurements_from_location,
    extract_city_name, extract_country, compute_overall_aqi,
)

router = APIRouter(tags=["AQI"])


@router.get("/aqi", response_model=AQIResponse, summary="Current AQI for a city")
async def get_aqi(city: str = Query(..., description="City name, e.g. Delhi")):
    """
    Returns the current Air Quality Index (AQI) for the specified city,
    calculated using the US EPA formula. Cached for 15 minutes.
    """
    cache_key = f"aqi:{city.lower()}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    locations = await fetch_latest_by_city(city)

    # Aggregate all measurements across all matching locations
    all_measurements = []
    last_updated = None
    country = "??"

    for loc in locations:
        measurements = extract_measurements_from_location(loc)
        all_measurements.extend(measurements)
        country = extract_country(loc)
        # Pick the most recent timestamp
        for m in measurements:
            if m.last_updated:
                if last_updated is None or m.last_updated > last_updated:
                    last_updated = m.last_updated

    # Deduplicate by parameter — keep highest value (worst case)
    param_map: dict[str, dict] = {}
    for m in all_measurements:
        existing = param_map.get(m.parameter)
        if existing is None or m.value > existing["value"]:
            param_map[m.parameter] = {"parameter": m.parameter, "value": m.value}

    aqi_val, category, dominant = compute_overall_aqi(list(param_map.values()))

    response = AQIResponse(
        city=city,
        country=country,
        aqi=aqi_val,
        category=category,
        dominant_pollutant=dominant,
        measurements=all_measurements,
        last_updated=last_updated,
    )

    cache.set(cache_key, response)
    return response