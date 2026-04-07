"""
Integration tests for all API endpoints.
OpenAQ network calls are fully mocked — no internet required.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
import services.cache as cache

MOCK_LOCATIONS = [
    {
        "id": 1001,
        "city": "Delhi",
        "locality": "Delhi",
        "name": "Delhi Station 1",
        "country": {"code": "IN", "name": "India"},
        "sensors": [
            {"parameter": {"name": "pm25", "units": "µg/m³"}, "lastValue": 120.5},
            {"parameter": {"name": "no2",  "units": "ppb"},   "lastValue": 60.0},
        ],
        "datetimeFirst": {"utc": "2024-01-15T08:00:00Z"},
    },
    {
        "id": 1002,
        "city": "Mumbai",
        "locality": "Mumbai",
        "name": "Mumbai Station 1",
        "country": {"code": "IN", "name": "India"},
        "sensors": [
            {"parameter": {"name": "pm25", "units": "µg/m³"}, "lastValue": 45.0},
        ],
        "datetimeFirst": {"utc": "2024-01-15T09:00:00Z"},
    },
]

MOCK_MEASUREMENTS = [
    {"value": 110.0, "date": {"utc": "2024-01-15T08:00:00Z"}},
    {"value": 130.0, "date": {"utc": "2024-01-15T09:00:00Z"}},
    {"value": 100.0, "date": {"utc": "2024-01-15T10:00:00Z"}},
]


@pytest.fixture(autouse=True)
def clear_cache_between_tests():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture()
def client():
    from main import app
    return TestClient(app)


# ── /  ──────────────────────────────────────────────────────────────────────

def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ── /cities ─────────────────────────────────────────────────────────────────

@patch("routes.cities.fetch_cities", new_callable=AsyncMock)
def test_cities_returns_list(mock_fetch, client):
    mock_fetch.return_value = MOCK_LOCATIONS
    r = client.get("/cities")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1


@patch("routes.cities.fetch_cities", new_callable=AsyncMock)
def test_cities_respects_limit(mock_fetch, client):
    mock_fetch.return_value = MOCK_LOCATIONS * 10  # 20 locations
    r = client.get("/cities?limit=1")
    assert r.status_code == 200
    assert len(r.json()) == 1


@patch("routes.cities.fetch_cities", new_callable=AsyncMock)
def test_cities_cached_on_second_call(mock_fetch, client):
    mock_fetch.return_value = MOCK_LOCATIONS
    client.get("/cities")
    client.get("/cities")
    # fetch_cities should only have been called once — second hit is from cache
    assert mock_fetch.call_count == 1


# ── /aqi ────────────────────────────────────────────────────────────────────

@patch("routes.aqi.fetch_latest_by_city", new_callable=AsyncMock)
def test_aqi_delhi(mock_fetch, client):
    mock_fetch.return_value = [MOCK_LOCATIONS[0]]
    r = client.get("/aqi?city=Delhi")
    assert r.status_code == 200
    body = r.json()
    assert body["city"] == "Delhi"
    assert isinstance(body["aqi"], int)
    assert body["aqi"] > 0
    assert "category" in body
    assert "dominant_pollutant" in body
    assert isinstance(body["measurements"], list)


@patch("routes.aqi.fetch_latest_by_city", new_callable=AsyncMock)
def test_aqi_missing_city_param(mock_fetch, client):
    r = client.get("/aqi")  # city is required
    assert r.status_code == 422


@patch("routes.aqi.fetch_latest_by_city", new_callable=AsyncMock)
def test_aqi_city_not_found(mock_fetch, client):
    from fastapi import HTTPException
    mock_fetch.side_effect = HTTPException(404, "No data found for city: XyzCity")
    r = client.get("/aqi?city=XyzCity")
    assert r.status_code == 404


# ── /trend ───────────────────────────────────────────────────────────────────

@patch("routes.trend.fetch_measurements", new_callable=AsyncMock)
@patch("routes.trend.fetch_latest_by_city", new_callable=AsyncMock)
def test_trend_delhi(mock_city, mock_meas, client):
    mock_city.return_value = [MOCK_LOCATIONS[0]]
    mock_meas.return_value = MOCK_MEASUREMENTS
    r = client.get("/trend?city=Delhi&parameter=pm25")
    assert r.status_code == 200
    body = r.json()
    assert body["city"] == "Delhi"
    assert body["parameter"] == "pm25"
    assert isinstance(body["trend"], list)
    assert len(body["trend"]) == len(MOCK_MEASUREMENTS)


@patch("routes.trend.fetch_measurements", new_callable=AsyncMock)
@patch("routes.trend.fetch_latest_by_city", new_callable=AsyncMock)
def test_trend_sorted_chronologically(mock_city, mock_meas, client):
    mock_city.return_value = [MOCK_LOCATIONS[0]]
    mock_meas.return_value = MOCK_MEASUREMENTS  # reversed in route, re-sorted asc
    r = client.get("/trend?city=Delhi&parameter=pm25")
    assert r.status_code == 200
    timestamps = [p["timestamp"] for p in r.json()["trend"]]
    assert timestamps == sorted(timestamps)


@patch("routes.trend.fetch_latest_by_city", new_callable=AsyncMock)
def test_trend_missing_city(mock_fetch, client):
    r = client.get("/trend")
    assert r.status_code == 422


# ── /health ──────────────────────────────────────────────────────────────────

@patch("routes.health.ping", new_callable=AsyncMock)
def test_health_ok(mock_ping, client):
    mock_ping.return_value = True
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["upstream"]["openaq"] == "reachable"
    assert "cache" in body


@patch("routes.health.ping", new_callable=AsyncMock)
def test_health_degraded_when_upstream_down(mock_ping, client):
    mock_ping.return_value = False
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "degraded"
    assert r.json()["upstream"]["openaq"] == "unreachable"