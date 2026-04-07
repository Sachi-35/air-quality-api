from fastapi import APIRouter, Query
from models.schemas import CityInfo
from services import cache, fetch_cities, extract_city_name, extract_country

router = APIRouter(tags=["Cities"])

CACHE_KEY = "cities_list"


@router.get("/cities", response_model=list[CityInfo], summary="List available cities")
async def get_cities(limit: int = Query(50, ge=1, le=200, description="Max number of cities")):
    """
    Returns a list of cities that have air quality monitoring stations on OpenAQ.
    Results are cached for 15 minutes.
    """
    cached = cache.get(CACHE_KEY)
    if cached:
        return cached[:limit]

    raw_locations = await fetch_cities(limit=200)

    seen: dict[str, CityInfo] = {}
    for loc in raw_locations:
        city = extract_city_name(loc)
        country = extract_country(loc)
        key = f"{city}|{country}"
        if key in seen:
            seen[key].locations_count += 1
        else:
            seen[key] = CityInfo(city=city, country=country, locations_count=1)

    result = list(seen.values())
    cache.set(CACHE_KEY, result)
    return result[:limit]