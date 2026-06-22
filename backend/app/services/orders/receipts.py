"""Private receipt-storage presentation helpers."""

from app.core import storage
from app.core.config import settings
from app.models.order import Order


def receipt_key_for(order: Order) -> str | None:
    if order.payment_receipt_key:
        return order.payment_receipt_key
    if not order.payment_receipt_url:
        return None
    parsed = storage.parse_public_url(
        order.payment_receipt_url,
        categories=[settings.storage_category_receipts],
    )
    return parsed[1] if parsed else None


async def attach_presigned_receipt(order: Order) -> None:
    """Expose a short-lived signed URL without persisting it to the model."""
    order.payment_receipt_url = (
        storage.signed_receipt_url(str(order.id)) if receipt_key_for(order) else None
    )


async def attach_presigned_receipts(orders: list[Order]) -> None:
    for order in orders:
        await attach_presigned_receipt(order)
