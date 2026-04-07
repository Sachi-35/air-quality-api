from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class Measurement(BaseModel):
    parameter: str
    value: float
    unit: str
    last_updated: Optional[datetime] = None


class CityInfo(BaseModel):
    city: str
    country: str
    locations_count: int


class AQIResponse(BaseModel):
    city: str
    country: str
    aqi: int
    category: str
    dominant_pollutant: str
    measurements: list[Measurement]
    last_updated: Optional[datetime] = None


class TrendPoint(BaseModel):
    timestamp: datetime
    aqi: int
    category: str


class TrendResponse(BaseModel):
    city: str
    parameter: str
    unit: str
    trend: list[TrendPoint]