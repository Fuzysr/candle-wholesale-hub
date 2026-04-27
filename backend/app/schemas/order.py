from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import OrderStatus


class _ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


Currency = Literal["RUB", "USD"]


# ---------- Order items ----------


class OrderItemIn(BaseModel):
    variant_id: UUID | None = None
    sku: str = Field(min_length=1, max_length=128)
    product_name: str = Field(min_length=1, max_length=500)
    variant_label: str | None = Field(default=None, max_length=500)
    pieces_per_box: int = Field(ge=1, le=100_000)
    boxes: int = Field(ge=1, le=100_000)
    unit_price: float = Field(ge=0, le=1_000_000)


class OrderItemOut(_ORM):
    id: UUID
    order_id: UUID
    variant_id: UUID | None
    sku: str
    product_name: str
    variant_label: str | None
    pieces_per_box: int
    boxes: int
    unit_price: float
    line_total: float
    created_at: datetime


# ---------- Order status history ----------


class OrderStatusHistoryOut(_ORM):
    id: UUID
    order_id: UUID
    status: OrderStatus
    comment: str | None
    changed_by: UUID | None
    created_at: datetime


# ---------- Orders ----------


class OrderCreate(BaseModel):
    currency: Currency = "RUB"
    delivery_address: str | None = Field(default=None, max_length=2000)
    delivery_date: date | None = None
    customer_comment: str | None = Field(default=None, max_length=5000)
    # buyer snapshot (required at order time)
    company_name: str | None = Field(default=None, max_length=500)
    contact_name: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    inn: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    items: list[OrderItemIn] = Field(min_length=1, max_length=200)


class OrderUpdateAdmin(BaseModel):
    status: OrderStatus | None = None
    admin_comment: str | None = None


class OrderBase(_ORM):
    id: UUID
    order_number: str
    user_id: UUID
    status: OrderStatus
    currency: str
    subtotal: float
    discount_percent: float
    discount_amount: float
    total: float
    total_boxes: int
    delivery_address: str | None
    delivery_date: date | None
    customer_comment: str | None
    admin_comment: str | None
    payment_receipt_url: str | None
    company_name: str | None
    contact_name: str | None
    phone: str | None
    inn: str | None
    email: str | None
    created_at: datetime
    updated_at: datetime


class OrderOut(OrderBase):
    items: list[OrderItemOut] = []


class OrderListOut(OrderBase):
    """Order row without items — used in list endpoints."""
