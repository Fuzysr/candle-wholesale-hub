"""Pytest fixtures for the FastAPI backend.

Requires a running Postgres instance reachable via `TEST_DATABASE_URL`
(defaults to `postgresql+asyncpg://candles:candles@localhost:5432/candles_test`).

Workflow per session:

1. Connect to the `postgres` maintenance DB and `CREATE DATABASE` the target
   test DB if it doesn't already exist.
2. Apply Alembic migrations to it (enums, triggers, singleton row, lookups).
3. Provide fixtures for `session`, `client`, and pre-seeded `admin_user` /
   `client_user` plus their bearer tokens.
4. After each test `TRUNCATE` every mutable table so tests are isolated.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
from collections.abc import AsyncGenerator
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Force a predictable test configuration BEFORE `app` modules are imported,
# so `Settings` picks these values up when the database/engine singletons are
# built at import time.
# ---------------------------------------------------------------------------
_TEST_ENV_DEFAULTS = {
    "APP_ENV": "test",
    "DATABASE_URL": "postgresql+asyncpg://candles:candles@localhost:5432/candles_test",
    "JWT_SECRET": "pytest-secret-key-0123456789-abcdefghijklmn",
    "BOOTSTRAP_ADMIN_EMAIL": "admin-bootstrap@test.local",
    "BOOTSTRAP_ADMIN_PASSWORD": "pytest-admin-pw",
    "S3_ENDPOINT_URL": "http://127.0.0.1:9000",
    "S3_PUBLIC_URL_BASE": "http://127.0.0.1:9000",
    "S3_ACCESS_KEY": "minioadmin",
    "S3_SECRET_KEY": "minioadmin",
    "INVENTORY_WEBHOOK_SECRET": "pytest-webhook-secret",
    "CORS_ORIGINS": "http://localhost:5173",
}
for _k, _v in _TEST_ENV_DEFAULTS.items():
    os.environ.setdefault(_k, _v)

import asyncpg  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.api.deps import db_session  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal, engine as app_engine  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.models.enums import AppRole  # noqa: E402
from app.models.user import User  # noqa: E402

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]

# Tables that are populated by the app at runtime. `company_settings` is
# intentionally excluded because the migration seeds the singleton row with
# id = 1 and tests expect it to be present.
_TRUNCATABLE_TABLES = [
    "order_status_history",
    "order_items",
    "orders",
    "stock_movements",
    "product_images",
    "product_variants",
    "products",
    "categories",
    "materials",
    "scents",
    "shapes",
    "discount_tiers",
    "users",
]


async def _ensure_test_database() -> None:
    parsed = urlparse(settings.database_url_async.replace("+asyncpg", ""))
    db_name = parsed.path.lstrip("/")
    admin_dsn = parsed._replace(path="/postgres").geturl()

    conn = await asyncpg.connect(admin_dsn)
    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", db_name
        )
        if not exists:
            await conn.execute(f'CREATE DATABASE "{db_name}"')
    finally:
        await conn.close()


def _apply_migrations() -> None:
    from alembic import command
    from alembic.config import Config as AlembicConfig

    cfg = AlembicConfig(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url_sync)
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
def _prepare_database() -> None:
    asyncio.run(_ensure_test_database())
    _apply_migrations()
    # Pre-truncate in case a previous run left data behind.
    asyncio.run(_truncate_all())


async def _truncate_all() -> None:
    async with app_engine.begin() as conn:
        tables = ", ".join(_TRUNCATABLE_TABLES)
        await conn.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE;"))


@pytest_asyncio.fixture(autouse=True)
async def _clean_between_tests() -> AsyncGenerator[None, None]:
    yield
    await _truncate_all()


@pytest_asyncio.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as s:
        yield s


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


async def _make_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    role: AppRole = AppRole.client,
    **extra: object,
) -> User:
    user = User(
        email=email.lower(),
        password_hash=hash_password(password),
        role=role,
        **extra,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(session: AsyncSession) -> User:
    return await _make_user(
        session,
        email="admin@test.local",
        password="admin-pw",
        role=AppRole.admin,
        company_name="Test Co",
    )


@pytest_asyncio.fixture
async def client_user(session: AsyncSession) -> User:
    return await _make_user(
        session,
        email="client@test.local",
        password="client-pw",
        company_name="Buyer Co",
        contact_name="Иван Иванов",
        phone="+79990000000",
    )


@pytest_asyncio.fixture
async def admin_token(admin_user: User) -> str:
    return create_access_token(str(admin_user.id), is_admin=True)


@pytest_asyncio.fixture
async def client_token(client_user: User) -> str:
    return create_access_token(str(client_user.id), is_admin=False)


@pytest.fixture
def auth_headers():
    def _factory(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    return _factory


__all__ = [
    "db_session",
    "hash_password",
    "settings",
]
