import time
from typing import Any, Optional
from config import settings

CACHE_TTL = settings.cache_ttl

_store: dict[str, tuple[Any, float]] = {}


def get(key: str) -> Optional[Any]:
    """Return cached value if not expired, else None."""
    entry = _store.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.time() > expires_at:
        del _store[key]
        return None
    return value


def set(key: str, value: Any, ttl: int = CACHE_TTL) -> None:
    """Store value with expiry timestamp."""
    _store[key] = (value, time.time() + ttl)


def invalidate(key: str) -> None:
    _store.pop(key, None)


def clear() -> None:
    _store.clear()