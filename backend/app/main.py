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

from app.api.routers import (  # noqa: E402  — imports must follow the patch above
    auth as auth_router,
    catalog as catalog_router,
    company as company_router,
    discounts as discounts_router,
    inventory as inventory_router,
    orders as orders_router,
    profile as profile_router,
    stock as stock_router,
    uploads as uploads_router,
)
from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(
        title="Candle Wholesale Hub API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "env": settings.app_env}

    app.include_router(auth_router.router)
    app.include_router(profile_router.router)
    app.include_router(catalog_router.router)
    app.include_router(discounts_router.router)
    app.include_router(orders_router.router)
    app.include_router(company_router.router)
    app.include_router(stock_router.router)
    app.include_router(inventory_router.router)
    app.include_router(uploads_router.router)

    return app


app = create_app()
