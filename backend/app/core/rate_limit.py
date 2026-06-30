"""Rate-limiting wiring for the FastAPI app.

We use **slowapi** (a thin wrapper around **limits**) for:

* per-IP bucket-based rate limiting on auth endpoints, where credential
  stuffing / password-reset-floods are the actual real-world attack;
* an opt-out flag (`Settings.rate_limit_enabled`) so the test suite can
  fire bursts of `client.post("/auth/login", ...)` without tripping the
  limiter and breaking unrelated assertions.

Storage is in-memory by default; for multi-uvicorn-worker prod deploys
the operator should configure `SLOWAPI_STORAGE_URI=redis://…` so the
counters live somewhere shared. We do not assume Redis here because a
single-worker MVP does not need it.

NOTE: limiter decorators require the endpoint to accept a `Request`
parameter — slowapi reads `request.state` and `request.client` to
identify the caller. The auth router endpoints have been updated
accordingly.
"""
from __future__ import annotations

from collections.abc import Iterable
from ipaddress import ip_address

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


def _client_key(request: Request) -> str:
    """Return the client identifier we limit on.

    Falls back to ``get_remote_address`` (which uses ``request.client.host``)
    but prefers the first hop of ``X-Forwarded-For`` when the app is
    deployed behind a reverse proxy. A spoofed XFF on a direct-exposure
    deploy would let an attacker rotate the «source IP» trivially, so
    operators MUST terminate / strip XFF at the edge in production.
    """
    direct_peer = get_remote_address(request)
    try:
        peer_is_trusted = ip_address(direct_peer) in {
            ip_address(value) for value in settings.trusted_proxy_ips
        }
    except ValueError:
        peer_is_trusted = False

    xff = request.headers.get("x-forwarded-for") or ""
    if peer_is_trusted and xff:
        # XFF is a comma-separated list, leftmost being the original
        # client. Trim whitespace; ignore empty entries from misconfigured
        # proxies that just append commas.
        first = xff.split(",", 1)[0].strip()
        if first:
            return first
    return direct_peer


# Defaults: NO limit applied unless the route explicitly opts in via a
# decorator. This keeps surprises out of unrelated routes (catalog,
# orders, …) — those are protected by auth instead, not rate limits.
# NOTE: `headers_enabled=False`. Setting it to True makes slowapi try
# to attach `X-RateLimit-*` headers via a `response: Response` parameter
# of the endpoint — none of our endpoints declare that parameter, and
# slowapi crashes on the successful path with "parameter `response`
# must be an instance of starlette.responses.Response". The 429
# itself still goes through `_rate_limit_exceeded` in `main.py`, which
# attaches `Retry-After` manually.
limiter = Limiter(
    key_func=_client_key,
    enabled=settings.rate_limit_enabled,
    headers_enabled=False,
    default_limits=[],
    storage_uri=settings.rate_limit_storage_uri,
)


# Per-endpoint policies. The login limit is intentionally tight — even
# a slow-burn brute-force at 5/minute means ~7k attempts per day per
# IP, which is plenty to detect with monitoring before the attacker
# guesses any password we accept (≥ 8 chars in `RegisterIn`).
LOGIN_LIMIT = "10/minute"
REGISTER_LIMIT = "5/minute"
PASSWORD_RESET_REQUEST_LIMIT = "3/minute"
REFRESH_LIMIT = "30/minute"


def all_known_limits() -> Iterable[str]:
    """For documentation / readability; not used by slowapi at runtime."""
    return (
        LOGIN_LIMIT,
        REGISTER_LIMIT,
        PASSWORD_RESET_REQUEST_LIMIT,
        REFRESH_LIMIT,
    )
