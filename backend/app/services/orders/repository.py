"""Persistence helpers for loading and numbering orders."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order, OrderNumberCounter

ORDER_COUNTER_ID = 1
ORDER_NUMBER_START = 10000


async def next_order_number(session: AsyncSession) -> str:
    """Reserve a sequential order number in the caller's transaction."""
    counter = (
        await session.execute(
            select(OrderNumberCounter)
            .where(OrderNumberCounter.id == ORDER_COUNTER_ID)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if counter is None:
        counter = OrderNumberCounter(id=ORDER_COUNTER_ID, next_value=ORDER_NUMBER_START)
        session.add(counter)
        await session.flush()
    value = counter.next_value
    counter.next_value = value + 1
    return f"CW-{value}"


async def load_order(session: AsyncSession, order_id: UUID) -> Order | None:
    """Load an order together with the lines needed by API responses."""
    return await session.scalar(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )


async def lock_order(session: AsyncSession, order_id: UUID) -> Order | None:
    """Lock an order before validating and applying a state transition."""
    return await session.scalar(select(Order).where(Order.id == order_id).with_for_update())
