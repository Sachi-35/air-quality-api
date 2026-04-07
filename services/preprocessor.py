from datetime import datetime, timezone
from typing import Optional
from models.schemas import Measurement


def parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        # Handle ISO 8601 with or without timezone
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def clean_measurement(raw: dict) -> Optional[Measurement]:
    """Extract and validate a single measurement from an OpenAQ sensor reading."""
    try:
        param = raw.get("parameter", "").lower().strip()
        value = raw.get("value")
        unit = raw.get("unit", "µg/m³")
        last_updated = parse_datetime(
            raw.get("lastUpdated") or raw.get("date", {}).get("utc")
        )

        if param == "" or value is None:
            return None

        value = float(value)
        if value < 0:  # Negative readings are invalid
            return None

        return Measurement(
            parameter=param,
            value=round(value, 2),
            unit=unit,
            last_updated=last_updated,
        )
    except (TypeError, ValueError):
        return None


def extract_measurements_from_location(location: dict) -> list[Measurement]:
    """Pull sensor readings from a location result."""
    measurements = []
    sensors = location.get("sensors", []) or location.get("parameters", [])

    for sensor in sensors:
        # v3 API nests latest value under lastValue
        value = sensor.get("lastValue") or sensor.get("value")
        param = sensor.get("parameter", {})
        param_name = param.get("name", "") if isinstance(param, dict) else str(param)
        unit = param.get("units", "µg/m³") if isinstance(param, dict) else "µg/m³"

        m = clean_measurement({
            "parameter": param_name,
            "value": value,
            "unit": unit,
            "lastUpdated": location.get("datetimeFirst", {}).get("utc") if isinstance(location.get("datetimeFirst"), dict) else None,
        })
        if m:
            measurements.append(m)

    return measurements


def extract_city_name(location: dict) -> str:
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


def extract_country(location: dict) -> str:
    country = location.get("country", {})
    if isinstance(country, dict):
        return country.get("code", "??")
    return str(country) if country else "??"