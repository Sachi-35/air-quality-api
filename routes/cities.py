from fastapi import APIRouter, Query, Request, Response
from models.schemas import CityInfo
from services import cache, fetch_cities, extract_city_name, extract_country
from limiter import limiter
from logger import get_logger

router = APIRouter(tags=["Cities"])
log = get_logger("routes.cities")

CACHE_KEY = "cities_list"


@router.get("/cities", response_model=list[CityInfo], summary="List available cities")
@limiter.limit("30/minute")
async def get_cities(
    request: Request,
    response: Response,
    limit: int = Query(50, ge=1, le=200, description="Max number of cities"),
):
    """
    Returns a list of cities that have air quality monitoring stations on OpenAQ.
    Results are cached for 15 minutes.
    """
    cached = cache.get(CACHE_KEY)
    if cached:
        log.debug("cities_cache_hit")
        return cached[:limit]

    log.info("cities_fetch", limit=limit)
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
    log.info("cities_fetched", total=len(result))
    return result[:limit]