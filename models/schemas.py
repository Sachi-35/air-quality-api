from pydantic import BaseModel, Field
from typing import List, Optional
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
    aqi: Optional[int] = None
    category: Optional[str] = None
    dominant_pollutant: Optional[str] = None
    measurements: List[Measurement] = Field(default_factory=list)
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