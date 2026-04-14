from datetime import datetime, timezone
from typing import Optional
from models.schemas import Measurement


def parse_datetime(value: Optional[str | dict]) -> Optional[datetime]:
    """
    Parse a datetime from either:
      - An ISO 8601 string  (legacy / v2 format)
      - An OpenAQ v3 datetime object: {"utc": "...", "local": "..."}
    """
    if not value:
        return None

    # FIX: OpenAQ v3 wraps timestamps in a dict — unwrap before parsing.
    if isinstance(value, dict):
        value = value.get("utc") or value.get("local")
        if not value:
            return None

    try:
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

        # FIX: lastUpdated in v3 can be a dict — delegate to parse_datetime
        last_updated = parse_datetime(
            raw.get("lastUpdated") or raw.get("date", {}).get("utc")
        )

        if param == "" or value is None:
            return None

        value = float(value)
        if value < 0:
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
    """Pull sensor readings from a location result.

    Handles both legacy payloads (value on the sensor object) and OpenAQ v3
    payloads where the latest reading is under sensor["latestValues"][0] or
    sensor["lastValue"].
    """
    measurements = []
    sensors = location.get("sensors", []) or location.get("parameters", [])

    for sensor in sensors:
        # FIX: v3 sometimes puts latest concentration in latestValues list
        value = sensor.get("lastValue")
        if value is None:
            latest_values = sensor.get("latestValues") or []
            if latest_values:
                value = latest_values[0].get("value")

        # Final fallback for legacy payloads
        if value is None:
            value = sensor.get("value")

        param = sensor.get("parameter", {})
        param_name = param.get("name", "") if isinstance(param, dict) else str(param)
        unit = (
            param.get("units")
            if isinstance(param, dict)
            else sensor.get("unit", "µg/m³")
        )

        # FIX: datetimeFirst may be a dict in v3 — parse_datetime handles both
        raw_ts = location.get("datetimeFirst") or location.get("datetimeLast")
        m = clean_measurement({
            "parameter": param_name,
            "value": value,
            "unit": unit,
            "lastUpdated": raw_ts,
        })
        if m:
            measurements.append(m)

    return measurements


def extract_parameters_from_location(location: dict) -> list[dict[str, str]]:
    """Extract parameter names and units from a location payload."""
    parameters = []
    sensors = location.get("sensors", []) or location.get("parameters", [])

    for sensor in sensors:
        param = sensor.get("parameter", {})
        if isinstance(param, dict):
            name = param.get("name") or param.get("parameter")
            units = param.get("units") or param.get("unit") or sensor.get("unit") or sensor.get("units")
        else:
            name = str(param)
            units = sensor.get("unit") or sensor.get("units")

        if not name or not isinstance(name, str):
            continue

        parameters.append(
            {
                "parameter": name.lower().strip(),
                "unit": units if units else "µg/m³",
            }
        )
    return parameters


def extract_city_name(location: dict) -> str:
    """Best-effort extraction of city name from location metadata."""
    for field in ("city", "locality", "name"):
        val = location.get(field)
        if val and isinstance(val, str) and val.strip():
            return val.strip()
    country = location.get("country", {})
    if isinstance(country, dict):
        return country.get("name", "Unknown")
    return str(country) if country else "Unknown"


def extract_country(location: dict) -> str:
    country = location.get("country", {})
    if isinstance(country, dict):
        return country.get("code", "??")
    return str(country) if country else "??"