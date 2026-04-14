"""
OpenAQ v3 REST client.

Key findings from live API inspection:
- /locations?city=X  is IGNORED — city param does nothing in v3
- /locations?iso=XX  is the correct country filter
- locality field is null for virtually all locations
- City name must be extracted from the location `name` field
  e.g. "Delhi Technological University, Delhi - CPCB" -> "Delhi"
- order_by only accepts 'id' — no sorting by lastUpdated
- Sensors with datetimeLast=null have no data — must be skipped
- CO is stored in mg/m3 labelled as ug/m3 by some providers —
  we normalise it before returning
"""

import re
import httpx
from fastapi import HTTPException
from config import settings

print("API KEY LOADED:", settings.openaq_api_key[:8] if settings.openaq_api_key else "EMPTY")

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "AirQualityMonitor/1.0",
}

_EXPECTED_UNITS: dict[str, set[str]] = {
    "pm25": {"µg/m³"},
    "pm10": {"µg/m³"},
    "no2":  {"ppb", "µg/m³"},
    "o3":   {"ppb", "µg/m³"},
    "so2":  {"ppb", "µg/m³"},
    "co":   {"ppm", "ppb", "mg/m³", "µg/m³"},
}

_CO_TO_PPM: dict[str, float] = {
    "ppm":   1.0,
    "ppb":   0.001,
    "mg/m³": 0.873,
    "µg/m³": 0.000873,
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
                return {"results": []}
            print("STATUS ERROR:", e.response.text)
            raise HTTPException(502, f"OpenAQ API error: {e.response.status_code}")
        except Exception as e:
            print("GENERAL ERROR:", str(e))
            raise HTTPException(502, f"Failed to reach OpenAQ: {str(e)}")


def _extract_city_from_name(location: dict) -> str:
    locality = location.get("locality")
    if locality and isinstance(locality, str) and locality.strip():
        return locality.strip()

    name = location.get("name", "")
    if name:
        # "Station Name, CityName - Provider" -> CityName
        m = re.search(r",\s*([^,\-]+?)\s*(?:-\s*\w|$)", name)
        if m:
            candidate = m.group(1).strip()
            if len(candidate) > 1:
                return candidate
        parts = [p.strip() for p in name.split(",")]
        if len(parts) > 1:
            last = parts[-1].split("-")[0].strip()
            if len(last) > 1:
                return last
        base = name.split(" - ")[0].strip()
        if base:
            return base

    country = location.get("country", {})
    if isinstance(country, dict):
        return country.get("name", "Unknown")
    return "Unknown"


def extract_city_name(location: dict) -> str:
    return _extract_city_from_name(location)


def extract_country(location: dict) -> str:
    country = location.get("country", {})
    if isinstance(country, dict):
        return country.get("code", "??")
    return str(country) if country else "??"


async def fetch_cities(limit: int = 100, page: int = 1) -> list[dict]:
    data = await _get("/locations", {"limit": limit, "page": page})
    return data.get("results", [])


async def fetch_latest_by_city(city: str) -> list[dict]:
    """
    Find locations for a given city name.
    Since OpenAQ v3 ignores city= param, we search across multiple pages
    client-side and match against the location name field.
    """
    import asyncio
    city_lower = city.lower()

    # Fan out across 5 pages of 100 to cover more of the DB
    tasks = [_get("/locations", {"limit": 100, "page": p}) for p in range(1, 6)]
    pages = await asyncio.gather(*tasks, return_exceptions=True)

    all_results = []
    for page in pages:
        if isinstance(page, Exception):
            continue
        all_results.extend(page.get("results", []))

    filtered = [
        loc for loc in all_results
        if city_lower in (loc.get("name") or "").lower()
        or city_lower in (loc.get("locality") or "").lower()
    ]
    with_data = [loc for loc in filtered if loc.get("datetimeLast")]
    return with_data if with_data else filtered


async def fetch_measurements(
    location: dict,
    parameter: str = None,
    limit: int = 24,
) -> list[dict]:
    # Do NOT filter sensors by datetimeLast here — /locations response does
    # not populate per-sensor datetimeLast. Use datetime_from on the measurements
    # request instead to get recent data.
    sensors = location.get("sensors", [])

    if parameter:
        param_lower = parameter.lower()
        allowed_units = _EXPECTED_UNITS.get(param_lower, set())
        matching = [
            s for s in sensors
            if s.get("parameter", {}).get("name", "").lower() == param_lower
            and (not allowed_units or s.get("parameter", {}).get("units", "") in allowed_units)
        ]
        if not matching:
            matching = [
                s for s in sensors
                if s.get("parameter", {}).get("name", "").lower() == param_lower
            ]
        sensors = matching
    else:
        preferred: dict[str, dict] = {}
        for s in sensors:
            p = s.get("parameter", {})
            name = p.get("name", "").lower()
            unit = p.get("units", "")
            if not name:
                continue
            if name not in preferred or unit == "µg/m³":
                preferred[name] = s
        sensors = list(preferred.values())

    from datetime import datetime, timezone, timedelta
    # OpenAQ has no working sort_order param — always returns oldest first.
    # Use datetime_from=7 days ago to get recent readings.
    datetime_from = (
        datetime.now(timezone.utc) - timedelta(days=7)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    results = []
    for sensor in sensors[:5]:
        sensor_id = sensor.get("id")
        if not sensor_id:
            continue

        data = await _get(
            f"/sensors/{sensor_id}/measurements",
            {"limit": limit, "datetime_from": datetime_from},
        )

        param_meta = sensor.get("parameter", {})
        param_name = param_meta.get("name", parameter or "")
        param_unit = param_meta.get("units", "µg/m³")

        for r in data.get("results", []):
            value = r.get("value")
            timestamp = (
                r.get("period", {}).get("datetimeTo", {}).get("utc")
                or r.get("period", {}).get("datetimeFrom", {}).get("utc")
                or r.get("lastUpdated")
            )
            if value is None:
                continue

            actual_unit = param_unit
            if param_name.lower() == "co" and param_unit in _CO_TO_PPM:
                value = float(value) * _CO_TO_PPM[param_unit]
                actual_unit = "ppm"

            results.append({
                "parameter":   param_name,
                "value":       value,
                "unit":        actual_unit,
                "lastUpdated": timestamp,
            })

    return results


async def ping() -> bool:
    try:
        await _get("/parameters", {"limit": 1})
        return True
    except Exception:
        return False