"""Admin stock management + outbound inventory sync."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import db_session, require_admin
from app.models.catalog import Product, ProductVariant
from app.models.enums import StockMovementType
from app.models.stock import StockMovement
from app.models.user import User
from app.schemas.stock import (
    InventorySnapshotItem,
    InventorySyncOut,
    StockOpIn,
    StockVariantOut,
)

router = APIRouter(tags=["stock"])


@router.get(
    "/admin/stock",
    response_model=list[StockVariantOut],
    dependencies=[Depends(require_admin)],
)
async def admin_stock_list(session: AsyncSession = Depends(db_session)) -> list[dict]:
    res = await session.scalars(
        select(ProductVariant).options(selectinload(ProductVariant.product))
    )
    out: list[dict] = []
    for v in res.all():
        out.append(
            {
                "id": v.id,
                "sku": v.sku,
                "product_id": v.product_id,
                "product_name": v.product.name_ru if v.product else "",
                "product_slug": v.product.slug if v.product else "",
                "stock_boxes": v.stock_boxes,
                "reserved_boxes": v.reserved_boxes,
                "external_id": v.external_id,
                "last_synced_at": v.last_synced_at,
            }
        )
    return out


@router.post(
    "/admin/stock/movements",
    response_model=StockVariantOut,
)
async def admin_stock_movement(
    payload: StockOpIn,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(db_session),
) -> dict:
    variant = await session.scalar(
        select(ProductVariant)
        .options(selectinload(ProductVariant.product))
        .where(ProductVariant.id == payload.variant_id)
    )
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="variant not found")

    old_stock = variant.stock_boxes
    reserved = variant.reserved_boxes

    if payload.type == "in":
        if payload.qty_boxes <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="qty must be > 0")
        new_stock = old_stock + payload.qty_boxes
        delta = payload.qty_boxes
        mtype = StockMovementType.in_
    elif payload.type == "out":
        if payload.qty_boxes <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="qty must be > 0")
        available = max(0, old_stock - reserved)
        if payload.qty_boxes > available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"only {available} boxes available",
            )
        new_stock = old_stock - payload.qty_boxes
        delta = -payload.qty_boxes
        mtype = StockMovementType.out
    else:  # adjust
        if payload.qty_boxes < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="qty must be >= 0"
            )
        new_stock = payload.qty_boxes
        delta = new_stock - old_stock
        mtype = StockMovementType.adjust

    variant.stock_boxes = new_stock
    session.add(
        StockMovement(
            variant_id=variant.id,
            type=mtype,
            qty_boxes=delta,
            source="admin",
            comment=payload.comment,
            created_by=admin.id,
        )
    )
    await session.commit()
    await session.refresh(variant)

    return {
        "id": variant.id,
        "sku": variant.sku,
        "product_id": variant.product_id,
        "product_name": variant.product.name_ru if variant.product else "",
        "product_slug": variant.product.slug if variant.product else "",
        "stock_boxes": variant.stock_boxes,
        "reserved_boxes": variant.reserved_boxes,
        "external_id": variant.external_id,
        "last_synced_at": variant.last_synced_at,
    }


@router.get(
    "/inventory/sync",
    response_model=InventorySyncOut,
    dependencies=[Depends(require_admin)],
)
async def inventory_sync(session: AsyncSession = Depends(db_session)) -> InventorySyncOut:
    """Outbound snapshot for integration with 1C / MoySklad / etc."""
    res = await session.scalars(
        select(ProductVariant).options(selectinload(ProductVariant.product))
    )
    items: list[InventorySnapshotItem] = []
    for v in res.all():
        items.append(
            InventorySnapshotItem(
                id=v.id,
                sku=v.sku,
                external_id=v.external_id,
                stock_boxes=v.stock_boxes,
                reserved_boxes=v.reserved_boxes,
                last_synced_at=v.last_synced_at,
                product_name=v.product.name_ru if v.product else None,
                product_slug=v.product.slug if v.product else None,
            )
        )
    return InventorySyncOut(ok=True, count=len(items), snapshot=items)
