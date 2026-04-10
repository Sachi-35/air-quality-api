from fastapi import APIRouter
from datetime import datetime, timezone
from services.openaq_client import ping
from services import cache
from config import settings

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Detailed health check")
async def health():
    """
    Returns API status, cache stats, config summary, and upstream reachability.
    """
    openaq_ok = await ping()
    cache_entries = len(cache._store)  # noqa: SLF001

    return {
        "status": "ok" if openaq_ok else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
        "upstream": {
            "openaq": "reachable" if openaq_ok else "unreachable",
            "base_url": settings.openaq_base_url,
        },
        "cache": {
            "entries": cache_entries,
            "ttl_seconds": settings.cache_ttl,
        },
        "config": {
            "debug": settings.debug,
            "cities_fetch_limit": settings.cities_fetch_limit,
            "api_key_configured": bool(settings.openaq_api_key),
        },
    }