from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import StockMovementType


class _ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Discount tiers ----------


class DiscountTierOut(_ORM):
    id: UUID
    min_boxes: int
    discount_percent: float
    created_at: datetime


class DiscountTierCreate(BaseModel):
    min_boxes: int = Field(ge=1)
    discount_percent: float = Field(ge=0, le=100)


class DiscountTierUpdate(BaseModel):
    min_boxes: int | None = Field(default=None, ge=1)
    discount_percent: float | None = Field(default=None, ge=0, le=100)


# ---------- Stock movements ----------


class StockMovementOut(_ORM):
    id: UUID
    variant_id: UUID
    type: StockMovementType
    qty_boxes: int
    source: str | None
    ref_id: str | None
    comment: str | None
    created_by: UUID | None
    created_at: datetime


# Admin-driven stock operation: `in` / `out` / `adjust` (as in StockOpDialog).
# `qty_boxes` is always positive; the backend derives the delta and new stock.
AdminOpType = Literal["in", "out", "adjust"]


class StockOpIn(BaseModel):
    variant_id: UUID
    type: AdminOpType
    qty_boxes: int = Field(ge=0)
    comment: str | None = None


class StockVariantOut(_ORM):
    """Admin stock view: one row per variant with product info."""

    id: UUID
    sku: str
    product_id: UUID
    product_name: str
    product_slug: str
    stock_boxes: int
    reserved_boxes: int
    external_id: str | None
    last_synced_at: datetime | None


# ---------- Inventory webhook (external -> us) ----------


class InventoryUpdateIn(BaseModel):
    sku: str | None = None
    external_id: str | None = None
    stock_boxes: int = Field(ge=0)


class InventoryWebhookIn(BaseModel):
    updates: list[InventoryUpdateIn] = Field(min_length=1)


class InventoryWebhookOut(BaseModel):
    ok: bool = True
    matched: int = 0
    updated: int = 0
    errors: list[str] = []


# ---------- Inventory sync (us -> external) ----------


class InventorySnapshotItem(BaseModel):
    id: UUID
    sku: str
    external_id: str | None
    stock_boxes: int
    reserved_boxes: int
    last_synced_at: datetime | None
    product_name: str | None
    product_slug: str | None


class InventorySyncOut(BaseModel):
    ok: bool = True
    count: int
    snapshot: list[InventorySnapshotItem]
