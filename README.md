# 🌬️ Air Quality Monitoring API

A FastAPI backend that fetches real-time data from OpenAQ, calculates AQI
using the US EPA formula, and serves it through clean REST endpoints.

---

## 📁 Project Structure

```
air_quality_api/
├── main.py                    # FastAPI app + CORS + router registration
├── requirements.txt
├── routes/
│   ├── __init__.py
│   ├── cities.py              # GET /cities
│   ├── aqi.py                 # GET /aqi?city=Delhi
│   └── trend.py               # GET /trend?city=Delhi
├── services/
│   ├── __init__.py
│   ├── openaq_client.py       # httpx calls to OpenAQ v3 API
│   ├── aqi_calculator.py      # EPA breakpoints + AQI formula
│   ├── preprocessor.py        # Data cleaning & field extraction
│   └── cache.py               # In-memory TTL cache (15 min)
└── models/
    ├── __init__.py
    └── schemas.py             # Pydantic response models
```

---

## ⚙️ Setup Instructions

### 1. Clone / create the project directory

```bash
mkdir air_quality_api && cd air_quality_api
# (copy all files from this package into it)
```

### 2. Create and activate a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
# or
venv\Scripts\activate           # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the server

```bash
uvicorn main:app --reload --port 8000
```

The API is now live at **http://localhost:8000**

---

## 🔗 Endpoints

### `GET /`
Health check.

```json
{"status": "ok", "message": "Air Quality Monitoring API is running"}
```

---

### `GET /cities?limit=50`
Returns a list of cities with monitoring stations.

**Query params:**
| Param | Default | Description |
|-------|---------|-------------|
| `limit` | 50 | Max cities to return (1–200) |

**Example:**
```bash
curl "http://localhost:8000/cities?limit=10"
```

```json
[
  {"city": "Delhi", "country": "IN", "locations_count": 3},
  {"city": "Mumbai", "country": "IN", "locations_count": 2}
]
```

---

### `GET /aqi?city=Delhi`
Returns the current AQI for a city, calculated from all available sensors.

**Query params:**
| Param | Required | Description |
|-------|----------|-------------|
| `city` | ✅ | City name |

**Example:**
```bash
curl "http://localhost:8000/aqi?city=Delhi"
```

```json
{
  "city": "Delhi",
  "country": "IN",
  "aqi": 187,
  "category": "Unhealthy",
  "dominant_pollutant": "pm25",
  "measurements": [
    {"parameter": "pm25", "value": 120.5, "unit": "µg/m³", "last_updated": "..."}
  ],
  "last_updated": "2024-01-15T10:30:00Z"
}
```

---

### `GET /trend?city=Delhi&parameter=pm25&limit=24`
Returns historical AQI readings for trend analysis.

**Query params:**
| Param | Default | Description |
|-------|---------|-------------|
| `city` | ✅ | City name |
| `parameter` | `pm25` | Pollutant (`pm25`, `pm10`, `no2`, `o3`, `so2`, `co`) |
| `limit` | 24 | Number of readings (1–100) |

**Example:**
```bash
curl "http://localhost:8000/trend?city=Delhi&parameter=pm25"
```

```json
{
  "city": "Delhi",
  "parameter": "pm25",
  "unit": "µg/m³",
  "trend": [
    {"timestamp": "2024-01-15T08:00:00Z", "aqi": 145, "category": "Unhealthy for Sensitive Groups"},
    {"timestamp": "2024-01-15T09:00:00Z", "aqi": 162, "category": "Unhealthy"}
  ]
}
```

---

### `GET /docs`
Interactive Swagger UI — test all endpoints in the browser.

---

## 🧮 AQI Calculation

Uses the **US EPA standard formula**:

```
AQI = ((I_hi - I_lo) / (C_hi - C_lo)) × (C - C_lo) + I_lo
```

Where `C` is the concentration and `I_lo/I_hi`, `C_lo/C_hi` are the breakpoint
values from the EPA table. Supported pollutants: PM2.5, PM10, O₃, NO₂, SO₂, CO.

**AQI Categories:**
| AQI | Category |
|-----|----------|
| 0–50 | Good |
| 51–100 | Moderate |
| 101–150 | Unhealthy for Sensitive Groups |
| 151–200 | Unhealthy |
| 201–300 | Very Unhealthy |
| 301–500 | Hazardous |

---

## ⚡ Caching

All responses are cached in memory with a **15-minute TTL** using a lightweight
dictionary-based store (`services/cache.py`). No Redis or external dependency needed.

Cache keys:
- `cities_list` — city list
- `aqi:{city}` — AQI per city
- `trend:{city}:{parameter}:{limit}` — trend per city+param

---

## 🔧 Dependencies

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `httpx` | Async HTTP client for OpenAQ |
| `pydantic` | Response validation & serialization |

No API key required — OpenAQ v3 is publicly accessible.