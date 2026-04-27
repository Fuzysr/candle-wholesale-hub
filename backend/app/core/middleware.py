"""Custom Starlette middlewares used by the FastAPI app.

Currently houses just :class:`SecurityHeadersMiddleware`, which attaches
the standard browser-side hardening headers to every HTTP response.

Why a hand-rolled middleware instead of `secure-headers` / `secure`?
* zero extra dependency for what is essentially a 30-line shim;
* the project's threat model is "JSON API + a separately-hosted SPA", so
  we deliberately stay narrow: no CSP for HTML/JS, no MIME-type juggling.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# Headers that are unconditional — always safe and useful regardless of
# environment (dev, test, prod).
_UNCONDITIONAL_HEADERS: dict[str, str] = {
    # Disable browser MIME-type sniffing. Without this, browsers may
    # decide that a file we serve as `application/octet-stream` is in
    # fact `text/html` and execute it. Combined with the magic-byte
    # validation on uploads (HIGH #4), this is the second wall.
    "X-Content-Type-Options": "nosniff",
    # The API never embeds itself in another origin's frame. `DENY` is
    # the strongest of the X-Frame-Options values; legacy browsers that
    # don't support `frame-ancestors` from CSP still respect this.
    "X-Frame-Options": "DENY",
    # Tell browsers to send no Referer when the user navigates from a
    # secure context to a less-secure one. We do not need referrers for
    # any analytics on this admin/wholesale tool.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Lock down a few high-risk browser features that this API has no
    # business asking for.
    "Permissions-Policy": (
        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
        "magnetometer=(), microphone=(), payment=(), usb=()"
    ),
    # Even though this app serves JSON only, a hostile injection that
    # makes the response look HTMLish (e.g. an upstream proxy returning
    # a default error page) would be useful to an attacker. CSP that
    # disallows everything by default is a robust safety net for an API.
    "Content-Security-Policy": (
        "default-src 'none'; "
        "frame-ancestors 'none'; "
        "base-uri 'none'; "
        "form-action 'none'"
    ),
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Stamp standard hardening headers onto every response.

    HSTS is conditional: it MUST NOT be sent in development because dev
    loopback servers usually run HTTP, and a leaked HSTS pin would force
    a browser to fail-close on the next dev request indefinitely.
    """

    def __init__(self, app, *, enable_hsts: bool) -> None:
        super().__init__(app)
        self._enable_hsts = enable_hsts

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)
        for name, value in _UNCONDITIONAL_HEADERS.items():
            # `setdefault` semantics: don't trample headers a route may
            # have set deliberately (e.g. a custom CSP for a special
            # endpoint, although none currently exists).
            response.headers.setdefault(name, value)

        if self._enable_hsts:
            # 1 year + subdomains; preload eligibility is left for the
            # operator to opt into via DNS / HSTS preload submission.
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )

        return response
