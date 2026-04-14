"""
24-hour AQI forecaster.

Algorithm:
  1. Fetch the last 48 hourly readings for the city/parameter via the trend route.
  2. Fit a weighted least-squares line through the (hour_index, aqi) pairs,
     giving more weight to recent readings.
  3. Extrapolate forward 24 hourly steps.
  4. Overlay a simple seasonal correction: if we have enough data, compute the
     mean residual per hour-of-day and add it back (captures diurnal patterns
     like rush-hour spikes).

No heavy ML libraries required — only numpy (already a transitive dep of most
FastAPI stacks). Falls back to a flat mean forecast if there are fewer than 3
data points.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Optional

try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:
    _HAS_NUMPY = False

from models.schemas import TrendPoint
from services.aqi_calculator import get_category


# ── public API ────────────────────────────────────────────────────────────────

class ForecastPoint:
    """Single predicted AQI data-point."""
    def __init__(self, timestamp: datetime, aqi: int, category: str, confidence: float):
        self.timestamp = timestamp
        self.aqi = aqi
        self.category = category
        # confidence: 0–1, degrades linearly with forecast horizon
        self.confidence = round(confidence, 3)

    def dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "aqi": self.aqi,
            "category": self.category,
            "confidence": self.confidence,
        }


def forecast_24h(
    history: list[TrendPoint],
    horizon: int = 24,
) -> tuple[list[ForecastPoint], str]:
    """
    Given a list of TrendPoints (sorted oldest→newest), return:
      - list of ForecastPoint for the next `horizon` hours
      - method string describing what algorithm was used

    Guarantees AQI is clamped to [0, 500].
    """
    n = len(history)

    if n == 0:
        return [], "no_data"

    if n < 3 or not _HAS_NUMPY:
        return _flat_forecast(history, horizon), "flat_mean"

    if n < 6:
        return _linear_forecast(history, horizon), "linear_regression"

    return _weighted_seasonal_forecast(history, horizon), "weighted_seasonal"


# ── internal algorithms ────────────────────────────────────────────────────────

def _flat_forecast(history: list[TrendPoint], horizon: int) -> list[ForecastPoint]:
    """Predict constant AQI equal to the mean of available data."""
    mean_aqi = int(round(sum(p.aqi for p in history) / len(history)))
    mean_aqi = _clamp(mean_aqi)
    last_ts = history[-1].timestamp
    return [
        ForecastPoint(
            timestamp=last_ts + timedelta(hours=i + 1),
            aqi=mean_aqi,
            category=get_category(mean_aqi),
            confidence=max(0.1, 0.5 - i * 0.015),
        )
        for i in range(horizon)
    ]


def _linear_forecast(history: list[TrendPoint], horizon: int) -> list[ForecastPoint]:
    """Simple OLS linear regression — no numpy required."""
    n = len(history)
    xs = list(range(n))
    ys = [p.aqi for p in history]
    x_mean = sum(xs) / n
    y_mean = sum(ys) / n
    num = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
    den = sum((x - x_mean) ** 2 for x in xs)
    slope = num / den if den != 0 else 0.0
    intercept = y_mean - slope * x_mean

    last_ts = history[-1].timestamp
    results = []
    for i in range(horizon):
        x_future = n + i
        predicted = intercept + slope * x_future
        aqi = _clamp(int(round(predicted)))
        results.append(ForecastPoint(
            timestamp=last_ts + timedelta(hours=i + 1),
            aqi=aqi,
            category=get_category(aqi),
            confidence=max(0.05, 0.75 - i * 0.025),
        ))
    return results


def _weighted_seasonal_forecast(
    history: list[TrendPoint], horizon: int
) -> list[ForecastPoint]:
    """
    Weighted least-squares regression with diurnal (hour-of-day) correction.

    Weights: exponential decay so that the most recent reading has weight 1.0
    and each older reading has weight *= decay_factor.
    """
    import numpy as np  # noqa: PLC0415 — already guarded above

    n = len(history)
    decay = 0.92  # tune: lower = more weight on recent points
    weights = np.array([decay ** (n - 1 - i) for i in range(n)])

    xs = np.arange(n, dtype=float)
    ys = np.array([p.aqi for p in history], dtype=float)

    # Weighted least squares: β = (XᵀWX)⁻¹ XᵀWy
    X = np.column_stack([np.ones(n), xs])
    W = np.diag(weights)
    try:
        beta = np.linalg.solve(X.T @ W @ X, X.T @ W @ ys)
    except np.linalg.LinAlgError:
        return _linear_forecast(history, horizon)

    intercept, slope = float(beta[0]), float(beta[1])

    # ── Diurnal correction ────────────────────────────────────────────────
    # Compute per-hour-of-day mean residual from the fitted line.
    residuals_by_hour: dict[int, list[float]] = {}
    for i, point in enumerate(history):
        fitted = intercept + slope * i
        residual = point.aqi - fitted
        hour = point.timestamp.hour
        residuals_by_hour.setdefault(hour, []).append(residual)

    hour_correction: dict[int, float] = {
        h: sum(v) / len(v) for h, v in residuals_by_hour.items()
    }

    # ── Forecast ──────────────────────────────────────────────────────────
    last_ts = history[-1].timestamp
    results = []
    for i in range(horizon):
        x_future = float(n + i)
        future_ts = last_ts + timedelta(hours=i + 1)
        predicted = intercept + slope * x_future
        correction = hour_correction.get(future_ts.hour, 0.0)
        aqi = _clamp(int(round(predicted + correction)))

        # Confidence: starts high (recent data), decays with horizon and
        # also with overall data variance.
        variance = float(np.var(ys))
        noise_penalty = min(0.3, variance / 5000)
        confidence = max(0.05, 0.9 - i * 0.02 - noise_penalty)

        results.append(ForecastPoint(
            timestamp=future_ts,
            aqi=aqi,
            category=get_category(aqi),
            confidence=confidence,
        ))

    return results


def _clamp(aqi: int) -> int:
    return max(0, min(500, aqi))