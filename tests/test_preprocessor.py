"""Unit tests for the data cleaning / preprocessing service."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.preprocessor import (
    clean_measurement,
    extract_measurements_from_location,
    extract_city_name,
    extract_country,
    parse_datetime,
)


class TestParseDatetime:
    def test_utc_z_suffix(self):
        dt = parse_datetime("2024-01-15T10:30:00Z")
        assert dt is not None
        assert dt.year == 2024

    def test_iso_with_offset(self):
        dt = parse_datetime("2024-01-15T10:30:00+05:30")
        assert dt is not None

    def test_none_input(self):
        assert parse_datetime(None) is None

    def test_invalid_string(self):
        assert parse_datetime("not-a-date") is None


class TestCleanMeasurement:
    def test_valid_measurement(self):
        raw = {"parameter": "pm25", "value": 45.5, "unit": "µg/m³"}
        m = clean_measurement(raw)
        assert m is not None
        assert m.parameter == "pm25"
        assert m.value == 45.5

    def test_negative_value_rejected(self):
        raw = {"parameter": "pm25", "value": -1.0, "unit": "µg/m³"}
        assert clean_measurement(raw) is None

    def test_none_value_rejected(self):
        raw = {"parameter": "pm25", "value": None, "unit": "µg/m³"}
        assert clean_measurement(raw) is None

    def test_empty_parameter_rejected(self):
        raw = {"parameter": "", "value": 10.0, "unit": "µg/m³"}
        assert clean_measurement(raw) is None

    def test_value_rounded_to_2dp(self):
        raw = {"parameter": "no2", "value": 12.3456789, "unit": "ppb"}
        m = clean_measurement(raw)
        assert m is not None
        assert m.value == 12.35

    def test_parameter_lowercased(self):
        raw = {"parameter": "PM25", "value": 10.0, "unit": "µg/m³"}
        m = clean_measurement(raw)
        assert m is not None
        assert m.parameter == "pm25"


class TestExtractCityName:
    def test_city_field(self):
        assert extract_city_name({"city": "Delhi"}) == "Delhi"

    def test_locality_fallback(self):
        assert extract_city_name({"locality": "Mumbai"}) == "Mumbai"

    def test_name_fallback(self):
        assert extract_city_name({"name": "Chennai Station"}) == "Chennai Station"

    def test_country_dict_fallback(self):
        result = extract_city_name({"country": {"name": "India"}})
        assert result == "India"

    def test_unknown_fallback(self):
        assert extract_city_name({}) == "Unknown"


class TestExtractCountry:
    def test_country_dict(self):
        assert extract_country({"country": {"code": "IN"}}) == "IN"

    def test_country_string(self):
        assert extract_country({"country": "US"}) == "US"

    def test_missing(self):
        assert extract_country({}) == "??"


class TestExtractMeasurementsFromLocation:
    def test_valid_location(self):
        location = {
            "sensors": [
                {
                    "parameter": {"name": "pm25", "units": "µg/m³"},
                    "lastValue": 55.0,
                }
            ]
        }
        measurements = extract_measurements_from_location(location)
        assert len(measurements) == 1
        assert measurements[0].parameter == "pm25"

    def test_empty_sensors(self):
        measurements = extract_measurements_from_location({"sensors": []})
        assert measurements == []

    def test_negative_value_filtered(self):
        location = {
            "sensors": [
                {"parameter": {"name": "pm25", "units": "µg/m³"}, "lastValue": -99},
            ]
        }
        measurements = extract_measurements_from_location(location)
        assert measurements == []