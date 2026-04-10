import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from config import settings
from limiter import limiter
from logger import setup_logging, get_logger
from routes import cities, aqi, trend
from routes.health import router as health_router

setup_logging()
log = get_logger("main")


# ── Lifespan (replaces deprecated @app.on_event) ──────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "startup",
        app=settings.app_name,
        debug=settings.debug,
        rate_limit=settings.rate_limit,
        cache_ttl_s=settings.cache_ttl,
        openaq_url=settings.openaq_base_url,
    )
    yield
    log.info("shutdown", app=settings.app_name)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.app_name,
    description="Real-time AQI data powered by OpenAQ",
    version="1.0.0",
    debug=settings.debug,
    lifespan=lifespan,
)

# ── Rate limiting ─────────────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request logging + timing ──────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    log.info(
        "request",
        method=request.method,
        path=request.url.path,
        query=str(request.query_params),
        status=response.status_code,
        duration_ms=duration_ms,
        client=request.client.host if request.client else "unknown",
    )
    response.headers["X-Response-Time-Ms"] = str(duration_ms)
    return response

# ── Global unhandled-exception handler ───────────────────────────────────────

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(health_router)
app.include_router(cities.router)
app.include_router(aqi.router)
app.include_router(trend.router)

# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": f"{settings.app_name} is running"}