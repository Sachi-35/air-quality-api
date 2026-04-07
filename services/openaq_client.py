import httpx
from fastapi import HTTPException
from config import settings

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "AirQualityMonitor/1.0",
}


def _build_headers() -> dict:
    h = dict(HEADERS)
    if settings.openaq_api_key:
        h["X-API-Key"] = settings.openaq_api_key
    return h


async def _get(path: str, params: dict = None) -> dict:
    url = f"{settings.openaq_base_url}{path}"
    async with httpx.AsyncClient(timeout=settings.openaq_timeout) as client:
        try:
            resp = await client.get(url, headers=_build_headers(), params=params or {})
            resp.raise_for_status()
            return resp.json()
        except httpx.TimeoutException:
            raise HTTPException(504, "OpenAQ API timed out")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                # Treat 404 as no data found, return empty results
                return {"results": []}
            print("STATUS ERROR:", e.response.text)   # 👈 ADD THIS
            raise HTTPException(502, f"OpenAQ API error: {e.response.status_code}")

        except Exception as e:
            print("GENERAL ERROR:", str(e))          # 👈 ADD THIS
            raise HTTPException(502, f"Failed to reach OpenAQ: {str(e)}")
        

async def fetch_cities(limit: int = 100) -> list[dict]:
    data = await _get("/locations", {"limit": limit})
    return data.get("results", [])


async def fetch_latest_by_city(city: str) -> list[dict]:
    data = await _get("/locations", {"city": city, "limit": 10})
    results = data.get("results", [])
    if not results:
        raise HTTPException(404, f"No data found for city: {city}")
    return results


async def fetch_measurements(location_id: int, parameter: str = "pm25", limit: int = 24) -> list[dict]:
    """Fetch historical measurements for trend analysis."""
    data = await _get(
        "/measurements",
        {
            "location_id": location_id,
            "parameter": parameter,
            "limit": limit,
            "sort": "desc",
        },
    )
    return data.get("results", [])


async def ping() -> bool:
    """Returns True if OpenAQ API is reachable."""
    try:
        await _get("/parameters", {"limit": 1})
        return True
    except Exception:
        return False