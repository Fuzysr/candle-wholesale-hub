"""Pytest fixtures for the FastAPI backend.

Targets **MySQL** via `DATABASE_URL` / `DATABASE_URL_SYNC` (defaults to a
`candles_test` database on localhost). The bootstrap + cleanup logic is
dialect-aware, so pointing both DSNs at SQLite also works — handy for running
the suite without a MySQL server.

Workflow per session:

1. For MySQL: connect to the server (no schema) and `CREATE DATABASE` the
   target test DB if it doesn't exist. (SQLite needs no bootstrap.)
2. Apply Alembic migrations to it (enums, singleton rows, lookups).
3. Provide fixtures for `session`, `client`, and pre-seeded `admin_user` /
   `client_user` plus their bearer tokens.
4. After each test, delete every mutable table's rows so tests are isolated.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import tempfile
from collections.abc import AsyncGenerator

from sqlalchemy.engine import make_url

# ---------------------------------------------------------------------------
# Force a predictable test configuration BEFORE `app` modules are imported,
# so `Settings` picks these values up when the database/engine singletons are
# built at import time.
# ---------------------------------------------------------------------------
_TEST_STORAGE_ROOT = tempfile.mkdtemp(prefix="candwax_test_storage_")

_TEST_ENV_DEFAULTS = {
    "APP_ENV": "test",
    "DATABASE_URL": "mysql+aiomysql://candles:candles@localhost:3306/candles_test",
    "DATABASE_URL_SYNC": "mysql+pymysql://candles:candles@localhost:3306/candles_test",
    "JWT_SECRET": "pytest-secret-key-0123456789-abcdefghijklmn",
    "BOOTSTRAP_ADMIN_EMAIL": "admin-bootstrap@test.local",
    "BOOTSTRAP_ADMIN_PASSWORD": "pytest-admin-pw",
    # Local filesystem storage — isolated temp dir per test session.
    "LOCAL_STORAGE_ROOT": _TEST_STORAGE_ROOT,
    "PUBLIC_UPLOAD_URL_BASE": "http://testserver/uploads",
    "BACKEND_BASE_URL": "http://testserver",
    "INVENTORY_WEBHOOK_SECRET": "pytest-webhook-secret",
    "CORS_ORIGINS": "http://localhost:5173",
    # Rate-limit OFF in test env: unrelated tests fire dozens of /auth/*
    # requests in a single second and would otherwise trip the per-IP
    # bucket. Tests that *do* validate rate-limiting explicitly toggle
    # this on via `monkeypatch`.
    "RATE_LIMIT_ENABLED": "false",
}
for _k, _v in _TEST_ENV_DEFAULTS.items():
    os.environ.setdefault(_k, _v)

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.api.deps import db_session  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.database import engine as app_engine  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.models.enums import AppRole  # noqa: E402
from app.models.user import User  # noqa: E402

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]

_DIALECT = make_url(settings.database_url).get_backend_name()  # 'mysql' | 'sqlite' | ...

# Mutable tables cleaned between tests, ordered children-first so a plain
# ordered DELETE satisfies foreign keys on any dialect. `company_settings` and
# `order_number_counters` are intentionally excluded — the migration seeds
# those singleton rows and tests expect them to stay present.
_CLEANUP_TABLES = [
    "order_status_history",
    "order_items",
    "orders",
    "stock_movements",
    "volume_discounts",
    "variant_images",
    "product_images",
    "product_variants",
    "products",
    "categories",
    "materials",
    "scents",
    "shapes",
    "discount_tiers",
    "contact_messages",
    "password_resets",
    "refresh_tokens",
    "users",
]


async def _ensure_test_database() -> None:
    """Create the MySQL test schema if it's missing. No-op for SQLite."""
    if _DIALECT != "mysql":
        return

    import pymysql

    url = make_url(settings.database_url_sync)
    conn = pymysql.connect(
        host=url.host or "localhost",
        port=url.port or 3306,
        user=url.username or "root",
        password=url.password or "",
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"CREATE DATABASE IF NOT EXISTS `{url.database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        conn.commit()
    finally:
        conn.close()


def _apply_migrations() -> None:
    from alembic.config import Config as AlembicConfig

    from alembic import command

    cfg = AlembicConfig(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url_sync)
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
def _prepare_database() -> None:
    asyncio.run(_ensure_test_database())
    _apply_migrations()
    # Pre-clean AND dispose the engine pool. Each `asyncio.run(...)` here
    # creates a fresh event loop; if we leave aiomysql connections in the pool
    # afterwards, pytest-asyncio's per-test loop later picks them up and
    # blows up with «Task got Future attached to a different loop» on the
    # very first pool pre-ping. Disposing forces a clean reconnect against
    # whatever loop the next test owns.
    asyncio.run(_truncate_and_dispose())


# Reference rows that the initial migration does NOT seed but several catalogue
# tests rely on. We re-insert them after every cleanup so list endpoints
# (`/attributes/*`) aren't empty. The tables are emptied first, so a plain
# INSERT never collides.
_REFERENCE_SEED_STATEMENTS: tuple[str, ...] = (
    """
    INSERT INTO materials (id, slug, name_ru, name_en, sort_order) VALUES
      ('11111111-1111-1111-1111-111111111101', 'paraffin', 'Парафин',        'Paraffin',    1),
      ('11111111-1111-1111-1111-111111111102', 'soy',      'Соевый воск',    'Soy wax',     2),
      ('11111111-1111-1111-1111-111111111103', 'beeswax',  'Пчелиный воск',  'Beeswax',     3),
      ('11111111-1111-1111-1111-111111111104', 'coconut',  'Кокосовый воск', 'Coconut wax', 4),
      ('11111111-1111-1111-1111-111111111105', 'palm',     'Пальмовый воск', 'Palm wax',    5)
    """,
    """
    INSERT INTO scents (id, slug, name_ru, name_en, sort_order) VALUES
      ('22222222-2222-2222-2222-222222222201', 'unscented', 'Без аромата', 'Unscented', 1),
      ('22222222-2222-2222-2222-222222222202', 'vanilla',   'Ваниль',      'Vanilla',   2),
      ('22222222-2222-2222-2222-222222222203', 'lavender',  'Лаванда',     'Lavender',  3),
      ('22222222-2222-2222-2222-222222222204', 'citrus',    'Цитрус',      'Citrus',    4),
      ('22222222-2222-2222-2222-222222222205', 'woody',     'Древесный',   'Woody',     5),
      ('22222222-2222-2222-2222-222222222206', 'floral',    'Цветочный',   'Floral',    6)
    """,
    """
    INSERT INTO shapes (id, slug, name_ru, name_en, sort_order) VALUES
      ('33333333-3333-3333-3333-333333333301', 'pillar',    'Колонна',   'Pillar',    1),
      ('33333333-3333-3333-3333-333333333302', 'taper',     'Конусная',  'Taper',     2),
      ('33333333-3333-3333-3333-333333333303', 'tealight',  'Чайная',    'Tealight',  3),
      ('33333333-3333-3333-3333-333333333304', 'container', 'В стакане', 'Container', 4),
      ('33333333-3333-3333-3333-333333333305', 'shaped',    'Фигурная',  'Shaped',    5)
    """,
)


async def _truncate_all() -> None:
    async with app_engine.begin() as conn:
        if _DIALECT == "mysql":
            await conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
            for table in _CLEANUP_TABLES:
                await conn.execute(text(f"TRUNCATE TABLE `{table}`"))
            await conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        else:
            # SQLite / others: ordered DELETE (children-first) satisfies FKs.
            for table in _CLEANUP_TABLES:
                await conn.execute(text(f"DELETE FROM {table}"))
        # Re-seed reference lookups (tables are now empty).
        for stmt in _REFERENCE_SEED_STATEMENTS:
            await conn.execute(text(stmt))


async def _truncate_and_dispose() -> None:
    await _truncate_all()
    await app_engine.dispose()


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
