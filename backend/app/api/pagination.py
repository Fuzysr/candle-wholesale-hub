"""Shared pagination helpers for list endpoints.

Every ``GET …/list`` endpoint that returns an unbounded ``list[T]`` is a
potential DoS vector: an attacker (or a healthy but large dataset) forces
the server to serialize thousands of rows in a single response,
saturating RAM and bandwidth. Cursor-based pagination is ideal but
requires per-model cursors; offset/limit is simpler and good enough
for an admin panel with up to ~50 k rows.

Usage in a router::

    from app.api.pagination import PaginationParams, pagination_params

    @router.get("/items", response_model=list[ItemOut])
    async def list_items(
        p: PaginationParams = Depends(pagination_params),
        session: AsyncSession = Depends(db_session),
    ):
        stmt = select(Item).order_by(Item.created_at.desc())
        stmt = stmt.offset(p.offset).limit(p.limit)
        return list((await session.scalars(stmt)).all())
"""
from dataclasses import dataclass

from fastapi import Query


@dataclass(frozen=True)
class PaginationParams:
    offset: int
    limit: int


# Потолок в 200 строк — разумный баланс: фронтенд редко рисует
# больше 50 за раз, а тяжёлые экспорты пусть идут через отдельный
# эндпоинт с потоковым ответом. 200 покрывает «загрузить все
# каталожные позиции» для магазинов средней руки.
MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 50


def pagination_params(
    offset: int = Query(0, ge=0, description="Сдвиг от начала списка"),
    limit: int = Query(
        DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE,
        description=f"Количество записей (макс. {MAX_PAGE_SIZE})",
    ),
) -> PaginationParams:
    return PaginationParams(offset=offset, limit=limit)
