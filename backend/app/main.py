# ruff: noqa: E402
from secrets import compare_digest

import email_validator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

# `email_validator` (used by pydantic `EmailStr`) rejects any address whose
# TLD is reserved by RFC 6762 / 2606 — `.local`, `.localhost`, `.test`,
# `.invalid`, `.onion`, `.arpa`. That breaks perfectly legitimate dev setups
# (e.g. `admin@candles.local`) and internal corporate domains. The app never
# actually sends mail, so clearing this allow-list is safe: EmailStr still
# enforces basic syntax (`local@host`, no whitespace, etc.).
email_validator.SPECIAL_USE_DOMAIN_NAMES = []

from fastapi import Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from app.api.routers import (  # imports must follow the email-validator patch above
    auth,
    catalog,
    company,
    contact,
    discounts,
    email,
    inventory,
    media,
    orders,
    profile,
    stock,
    uploads,
    users,
)
from app.core.auth_cookies import (
    ACCESS_COOKIE,
    CSRF_COOKIE,
    CSRF_HEADER,
    REFRESH_COOKIE,
)
from app.core.config import settings


def _rate_limit_exceeded(request: Request, exc) -> JSONResponse:  # noqa: ARG001
    """Render a `429 Too Many Requests` for slowapi's `RateLimitExceeded`.

    `exc.detail` looks like e.g. "10 per 1 minute" — we surface it so the
    client can show a meaningful message. `Retry-After: 60` is the
    standard hint for a per-minute window; slowapi's own
    `_rate_limit_exceeded_handler` does the same.
    """
    return JSONResponse(
        status_code=429,
        content={
            "detail": "rate limit exceeded",
            "limit": str(getattr(exc, "detail", "")),
        },
        headers={"Retry-After": "60"},
    )


def create_app() -> FastAPI:
    app = FastAPI(
        title="CANDWAX API",
        version="0.1.0",
        docs_url=None if settings.app_env == "production" else "/docs",
        redoc_url=None if settings.app_env == "production" else "/redoc",
        openapi_url=None if settings.app_env == "production" else "/openapi.json",
    )

    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)

    # Credentialed cookie auth is incompatible with wildcard origins. Local
    # LAN frontends must therefore be listed explicitly in CORS_ORIGINS too.
    @app.middleware("http")
    async def csrf_guard(request: Request, call_next):
        """Double-submit CSRF protection for browser cookie authentication.

        Bearer requests are not ambient browser credentials and remain exempt.
        Public requests without auth cookies remain usable by guests.
        """
        unsafe = request.method.upper() not in {"GET", "HEAD", "OPTIONS"}
        has_auth_cookie = bool(
            request.cookies.get(ACCESS_COOKIE) or request.cookies.get(REFRESH_COOKIE)
        )
        uses_bearer = request.headers.get("authorization", "").lower().startswith("bearer ")
        origin = request.headers.get("origin")
        fetch_site = request.headers.get("sec-fetch-site", "").lower()
        csrf_exempt_path = request.url.path in {
            "/auth/login",
            "/auth/register",
            "/auth/password/reset-request",
            "/auth/password/reset-confirm",
        }
        if (
            unsafe
            and has_auth_cookie
            and not uses_bearer
            and not csrf_exempt_path
        ):
            if fetch_site == "cross-site" or (origin and origin not in settings.cors_origins):
                return JSONResponse(status_code=403, content={"detail": "cross-site request blocked"})
            cookie_token = request.cookies.get(CSRF_COOKIE)
            header_token = request.headers.get(CSRF_HEADER)
            if (
                not cookie_token
                or not header_token
                or not compare_digest(cookie_token, header_token)
            ):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF validation failed"},
                )
        return await call_next(request)

    # Hardening headers on every response. HSTS is opt-in for production
    # only — see middleware module docstring for the «sticky pin in dev
    # browser» rationale.
    from app.core.middleware import (
        RequestBodyLimitMiddleware,
        SecurityHeadersMiddleware,
        UnhandledExceptionMiddleware,
    )

    app.add_middleware(
        RequestBodyLimitMiddleware,
        max_bytes=settings.max_request_body_bytes,
    )

    app.add_middleware(
        SecurityHeadersMiddleware,
        enable_hsts=settings.app_env == "production",
    )

    # Per-IP rate limiting on auth endpoints (HIGH #2). slowapi installs
    # itself as ASGI middleware and looks at `app.state.limiter` for
    # config; the exception handler turns a `RateLimitExceeded` into a
    # proper 429 response with `Retry-After` instead of letting it bubble.
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware

    from app.core.rate_limit import limiter

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded)
    app.add_middleware(SlowAPIMiddleware)

    # Serve PUBLIC uploads (product images, company assets) as static files.
    # Receipts are deliberately NOT mounted here — they live in a sibling
    # category dir under the same root and are only reachable through the
    # authenticated `/orders/{id}/receipt-file` endpoint. We mount each public
    # category individually (rather than the whole storage root) so a future
    # private category can never accidentally leak via StaticFiles.
    import os

    from fastapi.staticfiles import StaticFiles

    class CachedStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):  # type: ignore[no-untyped-def]
            response = await super().get_response(path, scope)
            if response.status_code == 200:
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return response

    storage_root = settings.local_storage_root
    for category in (settings.storage_category_products, settings.storage_category_company):
        category_dir = os.path.join(storage_root, category)
        os.makedirs(category_dir, exist_ok=True)
        app.mount(
            f"/uploads/{category}",
            CachedStaticFiles(directory=category_dir),
            name=f"uploads-{category}",
        )

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(contact.router)
    app.include_router(profile.router)
    app.include_router(catalog.router)
    app.include_router(discounts.router)
    app.include_router(orders.router)
    app.include_router(company.router)
    app.include_router(stock.router)
    app.include_router(inventory.router)
    app.include_router(media.router)
    app.include_router(uploads.router)
    app.include_router(users.router)
    app.include_router(email.router)

    # Keep exception normalization immediately inside CORS.  If an unhandled
    # exception escapes all the way to Starlette's ServerErrorMiddleware, the
    # generated 500 response has no CORS headers and browsers misreport it as
    # a network failure instead of exposing the actual HTTP response.
    app.add_middleware(UnhandledExceptionMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Authorization", "Content-Type", CSRF_HEADER],
    )

    return app


app = create_app()
