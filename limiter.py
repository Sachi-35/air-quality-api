"""
Rate limiting via slowapi (Starlette wrapper around limits).
Default: 60 requests / minute per IP.
Override via RATE_LIMIT env var, e.g. "30/minute" or "200/hour".
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from config import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.rate_limit],
    headers_enabled=True,      # adds X-RateLimit-* response headers
)