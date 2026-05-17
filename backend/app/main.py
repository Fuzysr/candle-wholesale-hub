import email_validator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# `email_validator` (used by pydantic `EmailStr`) rejects any address whose
# TLD is reserved by RFC 6762 / 2606 — `.local`, `.localhost`, `.test`,
# `.invalid`, `.onion`, `.arpa`. That breaks perfectly legitimate dev setups
# (e.g. `admin@candles.local`) and internal corporate domains. The app never
# actually sends mail, so clearing this allow-list is safe: EmailStr still
# enforces basic syntax (`local@host`, no whitespace, etc.).
email_validator.SPECIAL_USE_DOMAIN_NAMES = []

from fastapi import Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from app.api.routers import (  # noqa: E402  — imports must follow the patch above
    auth as auth_router,
    catalog as catalog_router,
    company as company_router,
    contact as contact_router,
    discounts as discounts_router,
    email as email_router,
    inventory as inventory_router,
    orders as orders_router,
    profile as profile_router,
    stock as stock_router,
    uploads as uploads_router,
    users as users_router,
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
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # In development, allow any origin so mobile devices on the same LAN
    # can reach the API without manually listing every local IP.
    origins = (
        ["*"] if settings.app_env == "development"
        else settings.cors_origins
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=settings.app_env != "development",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Hardening headers on every response. HSTS is opt-in for production
    # only — see middleware module docstring for the «sticky pin in dev
    # browser» rationale.
    from app.core.middleware import SecurityHeadersMiddleware

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

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "env": settings.app_env}

    app.include_router(auth_router.router)
    app.include_router(contact_router.router)
    app.include_router(profile_router.router)
    app.include_router(catalog_router.router)
    app.include_router(discounts_router.router)
    app.include_router(orders_router.router)
    app.include_router(company_router.router)
    app.include_router(stock_router.router)
    app.include_router(inventory_router.router)
    app.include_router(uploads_router.router)
    app.include_router(users_router.router)
    app.include_router(email_router.router)

    return app


app = create_app()
