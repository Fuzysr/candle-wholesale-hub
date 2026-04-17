"""Public-ish inventory webhook for external warehouse systems.

Authentication is a shared secret in the `x-webhook-secret` header — this
mirrors the Supabase edge function `inventory-webhook`.
"""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session
from app.core.config import settings
from app.models.catalog import ProductVariant
from app.models.enums import StockMovementType
from app.models.stock import StockMovement
from app.schemas.stock import InventoryWebhookIn, InventoryWebhookOut

router = APIRouter(prefix="/inventory", tags=["inventory"])


async def _verify_webhook_secret(
    x_webhook_secret: str | None = Header(default=None, alias="x-webhook-secret"),
) -> None:
    expected = settings.inventory_webhook_secret
    if not expected or x_webhook_secret != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")


@router.post(
    "/webhook",
    response_model=InventoryWebhookOut,
    dependencies=[Depends(_verify_webhook_secret)],
)
async def inventory_webhook(
    payload: InventoryWebhookIn,
    session: AsyncSession = Depends(db_session),
) -> InventoryWebhookOut:
    matched = 0
    updated = 0
    errors: list[str] = []
    now = datetime.now(UTC)

    for u in payload.updates:
        if not u.sku and not u.external_id:
            errors.append("no sku/external_id")
            continue

        stmt = select(ProductVariant).limit(1)
        if u.external_id:
            stmt = stmt.where(ProductVariant.external_id == u.external_id)
        else:
            stmt = stmt.where(ProductVariant.sku == u.sku)

        variant = await session.scalar(stmt)
        if variant is None:
            errors.append(f"not found: {u.sku or u.external_id}")
            continue

        matched += 1
        delta = u.stock_boxes - variant.stock_boxes
        variant.stock_boxes = u.stock_boxes
        variant.last_synced_at = now
        session.add(
            StockMovement(
                variant_id=variant.id,
                type=StockMovementType.sync,
                qty_boxes=delta,
                source="webhook",
                comment=f"external_id={u.external_id or '-'} sku={u.sku or '-'}",
            )
        )
        updated += 1

    await session.commit()
    return InventoryWebhookOut(ok=True, matched=matched, updated=updated, errors=errors)
