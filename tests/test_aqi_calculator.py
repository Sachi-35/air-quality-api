"""Unit tests for the EPA AQI calculator — zero network calls."""
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.aqi_calculator import calculate_aqi, get_category, compute_overall_aqi


class TestCalculateAQI:
    def test_pm25_good(self):
        # 5 µg/m³ → Good band (0–50 AQI)
        result = calculate_aqi("pm25", 5.0)
        assert result is not None
        assert 0 <= result <= 50

    def test_pm25_moderate(self):
        # 35 µg/m³ → Moderate band
        result = calculate_aqi("pm25", 35.0)
        assert result is not None
        assert 51 <= result <= 100

    def test_pm25_unhealthy(self):
        # 150 µg/m³ → Unhealthy (151–200)
        result = calculate_aqi("pm25", 150.0)
        assert result == 200

    def test_pm25_hazardous_clamp(self):
        # Above table max → clamped to 500
        result = calculate_aqi("pm25", 9999.0)
        assert result == 500

    def test_pm10_good(self):
        result = calculate_aqi("pm10", 10.0)
        assert result is not None
        assert 0 <= result <= 50

    def test_no2(self):
        result = calculate_aqi("no2", 100.0)
        assert result is not None
        assert 51 <= result <= 100

    def test_co(self):
        result = calculate_aqi("co", 4.0)
        assert result is not None
        assert 0 <= result <= 50

    def test_unknown_pollutant_returns_none(self):
        result = calculate_aqi("unobtainium", 100.0)
        assert result is None

    def test_negative_concentration(self):
        # Negative is out of all breakpoint ranges → None
        result = calculate_aqi("pm25", -1.0)
        assert result is None

    def test_zero_concentration(self):
        result = calculate_aqi("pm25", 0.0)
        assert result == 0

    def test_epa_formula_accuracy(self):
        # PM2.5 = 12.1 → exactly the first entry in second band → AQI should be 51
        result = calculate_aqi("pm25", 12.1)
        assert result == 51


class TestGetCategory:
    @pytest.mark.parametrize("aqi,expected", [
        (0,   "Good"),
        (50,  "Good"),
        (51,  "Moderate"),
        (100, "Moderate"),
        (101, "Unhealthy for Sensitive Groups"),
        (150, "Unhealthy for Sensitive Groups"),
        (151, "Unhealthy"),
        (200, "Unhealthy"),
        (201, "Very Unhealthy"),
        (300, "Very Unhealthy"),
        (301, "Hazardous"),
        (500, "Hazardous"),
    ])
    def test_category_boundaries(self, aqi, expected):
        assert get_category(aqi) == expected


class TestComputeOverallAQI:
    def test_picks_dominant_pollutant(self):
        measurements = [
            {"parameter": "pm25", "value": 12.0},   # AQI ~51
            {"parameter": "pm10", "value": 300.0},  # AQI ~175 — should dominate
        ]
        aqi, category, dominant = compute_overall_aqi(measurements)
        assert dominant == "pm10"
        assert aqi > 100

    def test_negative_values_skipped(self):
        measurements = [
            {"parameter": "pm25", "value": -5.0},
            {"parameter": "pm10", "value": 10.0},
        ]
        aqi, _, dominant = compute_overall_aqi(measurements)
        assert dominant == "pm10"

    def test_empty_list(self):
        aqi, category, dominant = compute_overall_aqi([])
        assert aqi == 0
        assert category == "Good"

    def test_unknown_pollutants_ignored(self):
        measurements = [{"parameter": "mystery_gas", "value": 9999}]
        aqi, _, _ = compute_overall_aqi(measurements)
        assert aqi == 0