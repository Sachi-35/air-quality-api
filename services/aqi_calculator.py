"""
EPA AQI calculation using the standard breakpoints table.
Reference: https://www.airnow.gov/sites/default/files/2020-05/aqi-technical-assistance-document-sept2018.pdf
"""

from typing import Optional

# (C_low, C_high, I_low, I_high) breakpoints per pollutant
_BREAKPOINTS: dict[str, list[tuple]] = {
    "pm25": [
        (0.0,   12.0,   0,  50),
        (12.1,  35.4,  51, 100),
        (35.5,  55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ],
    "pm10": [
        (0,   54,   0,  50),
        (55,  154,  51, 100),
        (155, 254, 101, 150),
        (255, 354, 151, 200),
        (355, 424, 201, 300),
        (425, 504, 301, 400),
        (505, 604, 401, 500),
    ],
    "o3": [   # ppb, 8-hour
        (0,    54,   0,  50),
        (55,   70,  51, 100),
        (71,   85, 101, 150),
        (86,  105, 151, 200),
        (106, 200, 201, 300),
    ],
    "no2": [  # ppb
        (0,    53,   0,  50),
        (54,  100,  51, 100),
        (101, 360, 101, 150),
        (361, 649, 151, 200),
        (650, 1249, 201, 300),
        (1250, 1649, 301, 400),
        (1650, 2049, 401, 500),
    ],
    "so2": [  # ppb
        (0,    35,   0,  50),
        (36,   75,  51, 100),
        (76,  185, 101, 150),
        (186, 304, 151, 200),
        (305, 604, 201, 300),
        (605, 804, 301, 400),
        (805, 1004, 401, 500),
    ],
    "co": [  # ppm
        (0.0,  4.4,   0,  50),
        (4.5,  9.4,  51, 100),
        (9.5, 12.4, 101, 150),
        (12.5, 15.4, 151, 200),
        (15.5, 30.4, 201, 300),
        (30.5, 40.4, 301, 400),
        (40.5, 50.4, 401, 500),
    ],
}

_CATEGORIES = [
    (50,  "Good"),
    (100, "Moderate"),
    (150, "Unhealthy for Sensitive Groups"),
    (200, "Unhealthy"),
    (300, "Very Unhealthy"),
    (500, "Hazardous"),
]


def _epa_formula(c: float, c_lo: float, c_hi: float, i_lo: int, i_hi: int) -> int:
    return round(((i_hi - i_lo) / (c_hi - c_lo)) * (c - c_lo) + i_lo)


def calculate_aqi(parameter: str, concentration: float) -> Optional[int]:
    """Return AQI integer for a given pollutant and concentration, or None if out of range."""
    param = parameter.lower().replace(".", "").replace(" ", "")
    breakpoints = _BREAKPOINTS.get(param)
    if not breakpoints:
        return None

    # FIX: Return None (not 0) for concentrations below the minimum breakpoint.
    # Previously, values below the lowest C_low would fall through and return None,
    # but compute_overall_aqi initialised best_aqi=0, so cities with only sub-zero
    # or missing readings appeared as AQI 0. Now we clamp to 0 only when the
    # concentration legitimately sits inside the first bracket (i.e. >= 0).
    if concentration < 0:
        return None

    # Clamp very small positive values to the first bracket floor
    if concentration < breakpoints[0][0]:
        concentration = breakpoints[0][0]

    for c_lo, c_hi, i_lo, i_hi in breakpoints:
        if c_lo <= concentration <= c_hi:
            return _epa_formula(concentration, c_lo, c_hi, i_lo, i_hi)

    # Concentration exceeds the highest breakpoint — clamp to 500
    return 500


def get_category(aqi: int) -> str:
    for threshold, label in _CATEGORIES:
        if aqi <= threshold:
            return label
    return "Hazardous"


def compute_overall_aqi(measurements: list[dict]) -> tuple[int, str, str]:
    """
    Given a list of {parameter, value} dicts, return (aqi, category, dominant_pollutant).
    Overall AQI = max of individual sub-indices.

    FIX: initialise best_aqi to None so that a city with zero valid measurements
    returns (0, "Good", "unknown") instead of silently reporting AQI 0 when
    every sub-index came back None (i.e. no data, not actually "Good" air).
    """
    best_aqi: Optional[int] = None
    dominant = "unknown"

    for m in measurements:
        param = m.get("parameter", "")
        value = m.get("value")
        if value is None or value < 0:
            continue
        sub_aqi = calculate_aqi(param, float(value))
        if sub_aqi is not None and (best_aqi is None or sub_aqi > best_aqi):
            best_aqi = sub_aqi
            dominant = param

    if best_aqi is None:
        # No valid sub-index could be computed — signal "no data" with 0
        return 0, "Unknown", "unknown"

    category = get_category(best_aqi)
    return best_aqi, category, dominant