"""Canonical order-line resolution and monetary calculations."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Any, TypedDict
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import ProductVariant
from app.models.stock import DiscountTier
from app.schemas.order import OrderItemIn


class CanonicalItem(TypedDict):
    variant_id: UUID
    variant_obj: ProductVariant
    sku: str
    product_name: str
    variant_label: str | None
    pieces_per_box: int
    boxes: int
    unit_price: Decimal
    volume_discounts: list[Any]


def quantize_money(value: Decimal | float | int | str) -> Decimal:
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _variant_label(variant: ProductVariant) -> str | None:
    parts = [part for part in (variant.size, variant.color, variant.shape) if part]
    return " · ".join(parts) if parts else None


async def resolve_canonical_items(
    session: AsyncSession,
    items: list[OrderItemIn],
    currency: str,
    *,
    lock_variants: bool = True,
) -> list[CanonicalItem]:
    """Resolve prices and product snapshots exclusively from the database."""
    variant_ids = [item.variant_id for item in items]
    stmt = (
        select(ProductVariant)
        .options(
            selectinload(ProductVariant.product),
            selectinload(ProductVariant.volume_discounts),
        )
        .where(ProductVariant.id.in_(variant_ids))
    )
    if lock_variants:
        stmt = stmt.with_for_update()
    variants = (await session.execute(stmt)).scalars().all() if variant_ids else []
    variants_by_id = {variant.id: variant for variant in variants}

    canonical: list[CanonicalItem] = []
    for item in items:
        variant = variants_by_id.get(item.variant_id)
        if variant is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": f"Товар {item.variant_id} больше недоступен",
                    "out_of_stock": [
                        {
                            "variant_id": str(item.variant_id),
                            "sku": str(item.variant_id),
                            "product_name": "",
                            "requested_boxes": item.boxes,
                            "available_boxes": 0,
                            "reason": "not_found",
                        }
                    ],
                },
            )
        unit_price = (
            variant.price_per_piece_rub if currency == "RUB" else variant.price_per_piece_usd
        )
        canonical.append(
            {
                "variant_id": variant.id,
                "variant_obj": variant,
                "sku": variant.sku,
                "product_name": variant.product.name_ru if variant.product else variant.sku,
                "variant_label": _variant_label(variant),
                "pieces_per_box": variant.pieces_per_box,
                "boxes": item.boxes,
                "unit_price": quantize_money(unit_price),
                "volume_discounts": list(variant.volume_discounts),
            }
        )
    return canonical


def _best_volume_discount(volume_discounts: list[Any], boxes: int) -> Decimal:
    applicable = (
        Decimal(str(rule.discount_percent)) for rule in volume_discounts if boxes >= rule.min_boxes
    )
    return max(applicable, default=Decimal("0"))


def compute_line_totals(
    rows: list[CanonicalItem],
) -> tuple[int, Decimal, Decimal, Decimal, Decimal, list[Decimal]]:
    line_totals: list[Decimal] = []
    total_boxes = 0
    subtotal_before = Decimal("0")
    subtotal_after = Decimal("0")
    for row in rows:
        line = quantize_money(
            row["unit_price"] * Decimal(row["pieces_per_box"]) * Decimal(row["boxes"])
        )
        subtotal_before += line
        volume_percent = _best_volume_discount(row["volume_discounts"], row["boxes"])
        if volume_percent > 0:
            line = quantize_money(line * (Decimal("100") - volume_percent) / Decimal("100"))
        line_totals.append(line)
        total_boxes += row["boxes"]
        subtotal_after += line

    discount_amount = quantize_money(subtotal_before - subtotal_after)
    return (
        total_boxes,
        quantize_money(subtotal_before),
        Decimal("0"),
        discount_amount,
        quantize_money(subtotal_after),
        line_totals,
    )


async def compute_order_pricing(
    session: AsyncSession,
    canonical: list[CanonicalItem],
) -> tuple[int, Decimal, Decimal, Decimal, Decimal, list[Decimal]]:
    totals = compute_line_totals(canonical)
    total_boxes, subtotal, discount_percent, discount_amount, total, line_totals = totals
    tiers = (await session.scalars(select(DiscountTier))).all()
    global_percent = max(
        (Decimal(str(tier.discount_percent)) for tier in tiers if total_boxes >= tier.min_boxes),
        default=Decimal("0"),
    )
    if global_percent > 0:
        global_discount = quantize_money(subtotal * global_percent / Decimal("100"))
        discount_percent = global_percent
        discount_amount = quantize_money(discount_amount + global_discount)
        total = quantize_money(max(Decimal("0"), total - global_discount))
    return total_boxes, subtotal, discount_percent, discount_amount, total, line_totals
