from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import OrderStatus
from app.models.types import GUID, TZDateTime

if TYPE_CHECKING:
    from app.models.catalog import ProductVariant
    from app.models.user import User


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    order_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_id: Mapped[UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[OrderStatus] = mapped_column(
        SAEnum(OrderStatus, name="order_status", create_type=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        server_default=text("'new'"),
        index=True,
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, server_default=text("'RUB'"))
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))
    discount_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, server_default=text("0"))
    discount_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))
    total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))
    total_boxes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    customer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Legacy public URL of the receipt object. Kept nullable for back-compat
    # with rows created before receipts were made private. New rows MUST leave
    # this empty and use `payment_receipt_key` instead — a short-lived signed
    # URL is then minted on demand (see orders._attach_presigned_receipt).
    payment_receipt_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Storage key of the uploaded payment receipt, inside the private
    # `storage_category_receipts` category (never served by StaticFiles).
    # Never expose directly — serve via the signed `/orders/{id}/receipt-file`.
    payment_receipt_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Snapshot of buyer/company info at order time
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    inn: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )
    history: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="OrderStatusHistory.created_at",
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(
        GUID(),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[UUID | None] = mapped_column(
        GUID(),
        ForeignKey("product_variants.id", ondelete="SET NULL"),
        nullable=True,
    )
    sku: Mapped[str] = mapped_column(String(255), nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    variant_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pieces_per_box: Mapped[int] = mapped_column(Integer, nullable=False)
    boxes: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")
    variant: Mapped["ProductVariant | None"] = relationship()


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(
        GUID(),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[OrderStatus] = mapped_column(
        SAEnum(OrderStatus, name="order_status", create_type=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[UUID | None] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)

    order: Mapped["Order"] = relationship(back_populates="history")
    changed_by_user: Mapped["User | None"] = relationship(back_populates="status_changes")


class OrderNumberCounter(Base):
    """Singleton counter handing out sequential human-facing order numbers.

    Replaces the PostgreSQL ``order_number_seq`` sequence + ``generate_order_number``
    trigger, which had no MySQL equivalent we wanted to keep. The next value is
    reserved application-side under a row lock — see
    ``app.api.routers.orders._next_order_number``.
    """

    __tablename__ = "order_number_counters"
    __table_args__ = (CheckConstraint("id = 1", name="singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, server_default=text("1"))
    # Next number to hand out. Starts at 10000 to match the old sequence
    # (``CREATE SEQUENCE order_number_seq START 10000``).
    next_value: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("10000"))
