"""Portable seed helpers — database-agnostic upserts.

These replace PostgreSQL-only ``INSERT … ON CONFLICT DO UPDATE/NOTHING`` (and
its ``RETURNING`` clause, which MySQL lacks) with plain ORM
select-then-create/update logic. The same seed scripts then run unchanged on
MySQL or anything else SQLAlchemy supports.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base


async def upsert[M: Base](
    session: AsyncSession,
    model: type[M],
    *,
    key: dict[str, Any],
    values: dict[str, Any],
) -> M:
    """Insert a row matching ``key`` or update the existing one with ``values``.

    Portable replacement for ``ON CONFLICT (key) DO UPDATE``. Returns the
    persisted ORM instance, flushed so its primary key (a Python-side
    ``uuid4`` default) is populated and usable for foreign-key references.
    """
    obj = await session.scalar(select(model).filter_by(**key))
    if obj is None:
        obj = model(**key, **values)
        session.add(obj)
    else:
        for field, value in values.items():
            setattr(obj, field, value)
    await session.flush()
    return obj


async def insert_if_absent[M: Base](
    session: AsyncSession,
    model: type[M],
    *,
    key: dict[str, Any],
    values: dict[str, Any] | None = None,
) -> M:
    """Create a row matching ``key`` if none exists; leave an existing one as-is.

    Portable replacement for ``ON CONFLICT (key) DO NOTHING``.
    """
    obj = await session.scalar(select(model).filter_by(**key))
    if obj is None:
        obj = model(**key, **(values or {}))
        session.add(obj)
        await session.flush()
    return obj
