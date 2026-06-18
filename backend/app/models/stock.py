from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Enum as SAEnum
from sqlalchemy import (
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import StockMovementType
from app.models.types import GUID, TZDateTime

if TYPE_CHECKING:
    from app.models.catalog import ProductVariant
    from app.models.user import User


class DiscountTier(Base):
    __tablename__ = "discount_tiers"
    __table_args__ = (UniqueConstraint("min_boxes", name="uq_discount_tiers_min_boxes"),)

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    min_boxes: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    variant_id: Mapped[UUID] = mapped_column(
        GUID(),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[StockMovementType] = mapped_column(
        SAEnum(
            StockMovementType,
            name="stock_movement_type",
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    qty_boxes: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)  # admin | order | webhook | 1c | ...
    ref_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)

    variant: Mapped["ProductVariant"] = relationship(back_populates="stock_movements")
    created_by_user: Mapped["User | None"] = relationship(back_populates="stock_movements")
