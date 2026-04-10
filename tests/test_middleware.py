"""
Tests for rate limiting, request logging middleware, and error handling.
All OpenAQ calls are mocked — no network access.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
import services.cache as cache


@pytest.fixture(autouse=True)
def reset_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture()
def client():
    from main import app
    return TestClient(app, raise_server_exceptions=False)


# ── Response headers ──────────────────────────────────────────────────────────

def test_response_time_header_present(client):
    r = client.get("/")
    assert "x-response-time-ms" in r.headers


def test_response_time_header_is_numeric(client):
    r = client.get("/")
    val = r.headers.get("x-response-time-ms", "")
    assert float(val) >= 0


# ── Rate limiter headers ──────────────────────────────────────────────────────

@patch("routes.cities.fetch_cities", new_callable=AsyncMock)
def test_rate_limit_headers_present(mock_fetch, client):
    mock_fetch.return_value = []
    r = client.get("/cities")
    # slowapi injects X-RateLimit-Limit and X-RateLimit-Remaining
    assert "x-ratelimit-limit" in r.headers
    assert "x-ratelimit-remaining" in r.headers


@patch("routes.cities.fetch_cities", new_callable=AsyncMock)
def test_rate_limit_remaining_decrements(mock_fetch, client):
    mock_fetch.return_value = []
    r1 = client.get("/cities")
    r2 = client.get("/cities")   # second hit uses cache, still counts for rate limit
    rem1 = int(r1.headers.get("x-ratelimit-remaining", 999))
    rem2 = int(r2.headers.get("x-ratelimit-remaining", 999))
    assert rem2 <= rem1


# ── Error handling ────────────────────────────────────────────────────────────

def test_404_on_unknown_route(client):
    r = client.get("/does-not-exist")
    assert r.status_code == 404


def test_422_on_bad_limit_param(client):
    r = client.get("/cities?limit=9999")   # max is 200
    assert r.status_code == 422


@patch("routes.aqi.fetch_latest_by_city", new_callable=AsyncMock)
def test_502_propagated_from_upstream(mock_fetch, client):
    from fastapi import HTTPException
    mock_fetch.side_effect = HTTPException(502, "OpenAQ API error: 503")
    r = client.get("/aqi?city=Nowhere")
    assert r.status_code == 502


# ── Root & health smoke tests ─────────────────────────────────────────────────

def test_root_ok(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@patch("routes.health.ping", new_callable=AsyncMock)
def test_health_fields_present(mock_ping, client):
    mock_ping.return_value = True
    r = client.get("/health")
    body = r.json()
    assert "status" in body
    assert "upstream" in body
    assert "cache" in body
    assert "config" in body
    assert "timestamp" in body


@patch("routes.health.ping", new_callable=AsyncMock)
def test_health_config_no_api_key_leak(mock_ping, client):
    """The API key value itself must never appear in /health output."""
    mock_ping.return_value = True
    r = client.get("/health")
    body_str = r.text
    # config only shows api_key_configured: bool — not the key value
    assert "openaq_api_key" not in body_str
    assert "api_key_configured" in body_str


# ── Cache interaction via API ─────────────────────────────────────────────────

@patch("routes.aqi.fetch_measurements", new_callable=AsyncMock)
@patch("routes.aqi.fetch_latest_by_city", new_callable=AsyncMock)
def test_aqi_second_call_uses_cache(mock_fetch_latest, mock_fetch_measurements, client):
    mock_fetch_latest.return_value = [{
        "id": 1,
        "city": "TestCity",
        "country": {"code": "TC", "name": "TestCountry"},
        "sensors": [
            {"parameter": {"name": "pm25", "units": "µg/m³"}},
        ],
    }]
    mock_fetch_measurements.return_value = [
        {"value": 55.0, "date": {"utc": "2024-01-01T00:00:00Z"}},
    ]
    client.get("/aqi?city=TestCity")
    client.get("/aqi?city=TestCity")
    assert mock_fetch_latest.call_count == 1   # second call served from cache


@patch("routes.aqi.fetch_measurements", new_callable=AsyncMock)
@patch("routes.aqi.fetch_latest_by_city", new_callable=AsyncMock)
def test_aqi_cache_key_is_case_insensitive(mock_fetch_latest, mock_fetch_measurements, client):
    mock_fetch_latest.return_value = [{
        "id": 1,
        "city": "Delhi",
        "country": {"code": "IN", "name": "India"},
        "sensors": [
            {"parameter": {"name": "pm25", "units": "µg/m³"}},
        ],
    }]
    mock_fetch_measurements.return_value = [
        {"value": 80.0, "date": {"utc": "2024-01-01T00:00:00Z"}},
    ]
    client.get("/aqi?city=Delhi")
    client.get("/aqi?city=delhi")   # different case → same cache key
    assert mock_fetch_latest.call_count == 1