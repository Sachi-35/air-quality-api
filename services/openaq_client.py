import httpx
from fastapi import HTTPException
from config import settings

print("API KEY LOADED:", settings.openaq_api_key[:8] if settings.openaq_api_key else "EMPTY")

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


def _extract_city_name(location: dict) -> str:
    """Best-effort extraction of city name from location metadata."""
    # Try different fields OpenAQ v3 might return
    for field in ("city", "locality", "name"):
        val = location.get(field)
        if val and isinstance(val, str) and val.strip():
            return val.strip()
    # Fall back to country code
    country = location.get("country", {})
    if isinstance(country, dict):
        return country.get("name", "Unknown")
    return str(country) if country else "Unknown"


async def fetch_latest_by_city(city: str) -> list[dict]:
    data = await _get("/locations", {"city": city, "limit": 50})
    results = data.get("results", [])

    # Filter client-side since OpenAQ city param is unreliable
    filtered = [
        loc for loc in results
        if city.lower() in loc.get("name", "").lower()
        or city.lower() in (loc.get("locality") or "").lower()
    ]

    if not filtered:
        # Fall back to unfiltered if nothing matched
        filtered = results

    if not filtered:
        raise HTTPException(404, f"No data found for city: {city}")

    return filtered


async def fetch_measurements(location: dict, parameter: str = None, limit: int = 24) -> list[dict]:
    from datetime import datetime, timezone, timedelta

    sensors = location.get("sensors", [])

    if parameter:
        sensors = [
            s for s in sensors
            if s.get("parameter", {}).get("name", "").lower() == parameter.lower()
            and s.get("parameter", {}).get("units", "") == "µg/m³"  # only µg/m³
        ]
    else:
        # Deduplicate: one µg/m³ sensor per parameter
        seen = set()
        filtered = []
        for s in sensors:
            param = s.get("parameter", {})
            name = param.get("name", "").lower()
            units = param.get("units", "")
            if units == "µg/m³" and name not in seen:
                seen.add(name)
                filtered.append(s)
        sensors = filtered

    results = []
    for sensor in sensors[:3]:
        sensor_id = sensor.get("id")
        if not sensor_id:
            continue
        data = await _get(
            f"/sensors/{sensor_id}/measurements",
            {"limit": limit, "date_order": "desc"}
        )
        for r in data.get("results", []):
            results.append({
                "parameter": r.get("parameter", {}).get("name", ""),
                "value": r.get("value"),
                "unit": r.get("parameter", {}).get("units", "µg/m³"),
                "lastUpdated": r.get("period", {}).get("datetimeTo", {}).get("utc"),
            })

    return results


async def ping() -> bool:
    """Returns True if OpenAQ API is reachable."""
    try:
        await _get("/parameters", {"limit": 1})
        return True
    except Exception:
        return False