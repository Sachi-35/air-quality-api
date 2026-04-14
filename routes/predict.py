from fastapi import APIRouter, Query, Request, Response, HTTPException
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from services import cache, fetch_latest_by_city, fetch_measurements, calculate_aqi, get_category, parse_datetime
from services.predictor import forecast_24h, ForecastPoint
from models.schemas import TrendPoint
from limiter import limiter
from logger import get_logger

router = APIRouter(tags=["Prediction"])
log = get_logger("routes.predict")


# ── response schemas ──────────────────────────────────────────────────────────

class PredictionPoint(BaseModel):
    timestamp: datetime
    aqi: int
    category: str
    confidence: float  # 0–1; degrades with forecast horizon


class PredictResponse(BaseModel):
    city: str
    parameter: str
    unit: str
    method: str          # flat_mean | linear_regression | weighted_seasonal
    history_points: int  # how many real readings fed the model
    forecast: list[PredictionPoint]
    message: Optional[str] = None


# ── route ─────────────────────────────────────────────────────────────────────

@router.get(
    "/predict",
    response_model=PredictResponse,
    summary="24-hour AQI forecast for a city",
)
@limiter.limit("10/minute")
async def get_prediction(
    request: Request,
    response: Response,
    city: str = Query(..., description="City name, e.g. Delhi"),
    parameter: str = Query("pm25", description="Pollutant parameter to forecast"),
):
    """
    Returns a 24-hour AQI forecast for the given city and pollutant.

    The forecast is built from the last 48 real hourly readings fetched from
    OpenAQ. The algorithm used depends on how much data is available:

    - **weighted_seasonal** (≥ 6 points): weighted least-squares regression
      plus a per-hour-of-day diurnal correction.
    - **linear_regression** (3–5 points): simple OLS line.
    - **flat_mean** (1–2 points): constant forecast equal to the data mean.
    - **no_data** (0 points): empty forecast list.

    Each point includes a `confidence` score (0–1) that decays with horizon
    distance and data variance.
    """
    cache_key = f"predict:{city.lower()}:{parameter}"
    cached = cache.get(cache_key)
    if cached:
        log.debug("predict_cache_hit", city=city, parameter=parameter)
        return cached

    log.info("predict_fetch", city=city, parameter=parameter)

    # ── 1. Find a station that has the requested parameter ─────────────────
    locations = await fetch_latest_by_city(city)
    if not locations:
        raise HTTPException(404, f"No monitoring stations found for: {city}")

    target_location = None
    unit = "µg/m³"

    for loc in locations:
        sensors = loc.get("sensors", []) or loc.get("parameters", [])
        for sensor in sensors:
            param = sensor.get("parameter", {})
            param_name = (
                param.get("name", "") if isinstance(param, dict) else str(param)
            ).lower()
            if param_name == parameter.lower():
                target_location = loc
                if isinstance(param, dict):
                    unit = param.get("units", "µg/m³")
                break
        if target_location:
            break

    if not target_location:
        raise HTTPException(
            404,
            f"No '{parameter}' sensor found in {city}. "
            "Try parameter=pm10, no2, o3, so2, or co.",
        )

    # ── 2. Fetch up to 48 historical readings ─────────────────────────────
    raw_measurements = await fetch_measurements(target_location, parameter, limit=48)

    history: list[TrendPoint] = []
    for m in raw_measurements:
        value = _extract_value(m)
        timestamp = parse_datetime(m.get("lastUpdated") or m.get("date"))
        if value is None or value < 0 or timestamp is None:
            continue
        sub_aqi = calculate_aqi(parameter, float(value))
        if sub_aqi is None:
            continue
        history.append(TrendPoint(
            timestamp=timestamp,
            aqi=sub_aqi,
            category=get_category(sub_aqi),
        ))

    history.sort(key=lambda p: p.timestamp)

    # ── 3. Run the forecast model ──────────────────────────────────────────
    forecast_points, method = forecast_24h(history, horizon=24)

    result = PredictResponse(
        city=city,
        parameter=parameter,
        unit=unit,
        method=method,
        history_points=len(history),
        forecast=[
            PredictionPoint(
                timestamp=fp.timestamp,
                aqi=fp.aqi,
                category=fp.category,
                confidence=fp.confidence,
            )
            for fp in forecast_points
        ],
        message=(
            "Insufficient historical data — forecast accuracy will be low."
            if len(history) < 6 else None
        ),
    )

    # Cache forecasts for 30 minutes (longer than trend; model is expensive)
    cache.set(cache_key, result, ttl=1800)
    log.info(
        "predict_done",
        city=city,
        parameter=parameter,
        method=method,
        history_points=len(history),
    )
    return result


# ── helper ────────────────────────────────────────────────────────────────────

def _extract_value(m: dict) -> float | None:
    value = m.get("value")
    if isinstance(value, dict):
        value = value.get("avg") or value.get("min")
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None