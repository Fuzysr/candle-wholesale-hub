"""Inventory reservation rules for orders."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import ProductVariant
from app.models.enums import StockMovementType
from app.models.order import Order, OrderItem
from app.models.stock import StockMovement
from app.services.orders.pricing import CanonicalItem


def assert_stock_available(rows: list[CanonicalItem]) -> None:
    """Report all unavailable canonical lines in one conflict response."""
    shortages: list[dict[str, object]] = []
    for row in rows:
        variant = row["variant_obj"]
        available = max(0, (variant.stock_boxes or 0) - (variant.reserved_boxes or 0))
        if row["boxes"] > available:
            shortages.append(
                {
                    "variant_id": str(variant.id),
                    "sku": variant.sku,
                    "product_name": row["product_name"],
                    "requested_boxes": row["boxes"],
                    "available_boxes": available,
                    "reason": "insufficient_stock",
                }
            )
    if shortages:
        lines = ", ".join(
            f"{item['sku']} (нужно {item['requested_boxes']}, доступно {item['available_boxes']})"
            for item in shortages
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"Недостаточно товара на складе: {lines}",
                "out_of_stock": shortages,
            },
        )


async def _locked_order_inventory(
    session: AsyncSession, order: Order
) -> tuple[list[OrderItem], dict]:
    items = list(
        (await session.scalars(select(OrderItem).where(OrderItem.order_id == order.id))).all()
    )
    variant_ids = [item.variant_id for item in items if item.variant_id is not None]
    if not variant_ids:
        return items, {}
    variants = (
        await session.scalars(
            select(ProductVariant).where(ProductVariant.id.in_(variant_ids)).with_for_update()
        )
    ).all()
    return items, {variant.id: variant for variant in variants}


async def release_reservation(session: AsyncSession, order: Order) -> None:
    items, variants = await _locked_order_inventory(session, order)
    for item in items:
        variant = variants.get(item.variant_id)
        if variant is not None:
            variant.reserved_boxes = max(0, (variant.reserved_boxes or 0) - item.boxes)


async def ship_reservation(session: AsyncSession, order: Order) -> None:
    items, variants = await _locked_order_inventory(session, order)
    for item in items:
        variant = variants.get(item.variant_id)
        if variant is None:
            continue
        variant.stock_boxes = max(0, (variant.stock_boxes or 0) - item.boxes)
        variant.reserved_boxes = max(0, (variant.reserved_boxes or 0) - item.boxes)
        session.add(
            StockMovement(
                variant_id=variant.id,
                type=StockMovementType.out,
                qty_boxes=-item.boxes,
                source="order",
                comment=f"order #{order.order_number}",
            )
        )
