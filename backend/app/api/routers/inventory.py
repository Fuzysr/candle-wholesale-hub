"""Public-ish inventory webhook for external warehouse systems.

Authentication is a shared secret in the `x-webhook-secret` header — this
mirrors the Supabase edge function `inventory-webhook`.
"""
import hmac
import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session
from app.core.config import settings
from app.core.rate_limit import limiter
from app.models.catalog import ProductVariant
from app.models.enums import StockMovementType
from app.models.stock import StockMovement
from app.schemas.stock import InventoryWebhookIn, InventoryWebhookOut

router = APIRouter(prefix="/inventory", tags=["inventory"])

# Reject obviously-unsafe placeholder values from `.env.example`. We refuse
# to authenticate any caller against a "well-known" secret because that is
# functionally identical to having no auth at all.
_WEAK_WEBHOOK_SECRETS = frozenset({
    "",
    "replace-me",
    "change-me",
    "secret",
    "test",
})


async def _verify_webhook_secret(
    request: Request,
    x_webhook_secret: str | None = Header(default=None, alias="x-webhook-secret"),
    x_webhook_timestamp: str | None = Header(default=None, alias="x-webhook-timestamp"),
    x_webhook_signature: str | None = Header(default=None, alias="x-webhook-signature"),
) -> None:
    expected = settings.inventory_webhook_secret or ""
    presented = x_webhook_secret or ""

    # Defence-in-depth: if the operator left the placeholder secret in
    # config, treat the endpoint as locked (401 with no further detail).
    if expected.strip().lower() in _WEAK_WEBHOOK_SECRETS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized"
        )

    # `hmac.compare_digest` is constant-time over the length of the
    # smaller string, which is what we want for this comparison —
    # `==` would short-circuit on the first mismatched byte.
    signed = bool(x_webhook_timestamp and x_webhook_signature)
    if signed:
        try:
            timestamp = int(x_webhook_timestamp or "")
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="unauthorized") from exc
        if abs(int(time.time()) - timestamp) > 300:
            raise HTTPException(status_code=401, detail="unauthorized")
        body = await request.body()
        expected_signature = "sha256=" + hmac.new(
            expected.encode(),
            (x_webhook_timestamp + ".").encode() + body,
            "sha256",
        ).hexdigest()
        if not hmac.compare_digest(x_webhook_signature or "", expected_signature):
            raise HTTPException(status_code=401, detail="unauthorized")
        return

    # Legacy header remains available in development/test for existing local
    # integrations. Production requires a timestamped body signature so a
    # captured request cannot be replayed indefinitely.
    if settings.app_env == "production" or not hmac.compare_digest(
        presented.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized"
        )


@router.post(
    "/webhook",
    response_model=InventoryWebhookOut,
    dependencies=[Depends(_verify_webhook_secret)],
)
@limiter.limit("30/minute")
async def inventory_webhook(
    request: Request,  # noqa: ARG001 -- slowapi client key
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
