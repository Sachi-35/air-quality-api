import asyncio
from fastapi import APIRouter, Query, Request, Response
from models.schemas import CityInfo
from services import cache, fetch_cities, extract_city_name, extract_country
from limiter import limiter
from logger import get_logger

router = APIRouter(tags=["Cities"])
log = get_logger("routes.cities")

CACHE_KEY = "cities_list"

# FIX: fetch multiple pages in parallel to surface more cities.
# OpenAQ v3 /locations caps at 100 per page — we fan out across several
# pages concurrently and deduplicate, giving us a much richer list.
_PAGES = 5          # fetch up to 5 pages in parallel
_PAGE_SIZE = 100    # max allowed by OpenAQ v3


@router.get("/cities", response_model=list[CityInfo], summary="List available cities")
@limiter.limit("30/minute")
async def get_cities(
    request: Request,
    response: Response,
    limit: int = Query(50, ge=1, le=500, description="Max number of cities to return"),
):
    """
    Returns a list of cities that have air quality monitoring stations on OpenAQ.
    Results are cached for 15 minutes.

    FIX: Now fetches multiple pages in parallel (up to 500 locations) instead
    of a single page of 200, so the list is significantly larger.
    """
    cached = cache.get(CACHE_KEY)
    if cached:
        log.debug("cities_cache_hit")
        return cached[:limit]

    log.info("cities_fetch_start", pages=_PAGES, page_size=_PAGE_SIZE)

    # Fan out: fetch all pages concurrently.
    # return_exceptions=True means a failed page won't cancel the others.
    tasks = [
        fetch_cities(limit=_PAGE_SIZE, page=page)
        for page in range(1, _PAGES + 1)
    ]
    pages_results = await asyncio.gather(*tasks, return_exceptions=True)

    # OpenAQ returns an empty results list once we go past the last page —
    # stop early so we don't waste the cache on empty entries.


    seen: dict[str, CityInfo] = {}
    total_raw = 0

    for page_idx, page_data in enumerate(pages_results, start=1):
        if isinstance(page_data, Exception):
            log.warning("cities_page_error", page=page_idx, error=str(page_data))
            continue

        raw_locations = page_data or []
        total_raw += len(raw_locations)

        for loc in raw_locations:
            city = extract_city_name(loc)
            country = extract_country(loc)

            # Skip placeholder / empty city names
            if not city or city.lower() in ("unknown", "??", ""):
                continue

            key = f"{city}|{country}"
            if key in seen:
                seen[key].locations_count += 1
            else:
                seen[key] = CityInfo(city=city, country=country, locations_count=1)

    # Sort by number of monitoring stations descending so well-covered
    # cities appear at the top of the list.
    result = sorted(seen.values(), key=lambda c: c.locations_count, reverse=True)

    cache.set(CACHE_KEY, result)
    log.info("cities_fetched", total_locations=total_raw, unique_cities=len(result))
    return result[:limit]