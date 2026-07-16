from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.types import GUID, TZDateTime

if TYPE_CHECKING:
    from app.models.stock import StockMovement


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    parent_id: Mapped[UUID | None] = mapped_column(
        GUID(),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    show_on_home: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    home_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    parent: Mapped["Category | None"] = relationship(remote_side="Category.id", back_populates="children")
    children: Mapped[list["Category"]] = relationship(back_populates="parent")
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)


class Scent(Base):
    __tablename__ = "scents"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)


class Shape(Base):
    __tablename__ = "shapes"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    category_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    material_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("materials.id", ondelete="SET NULL"), nullable=True
    )
    scent_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("scents.id", ondelete="SET NULL"), nullable=True
    )
    shape_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("shapes.id", ondelete="SET NULL"), nullable=True
    )
    name_ru: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    description_ru: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    category: Mapped["Category | None"] = relationship(back_populates="products")
    material: Mapped["Material | None"] = relationship()
    scent: Mapped["Scent | None"] = relationship()
    shape: Mapped["Shape | None"] = relationship()
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", passive_deletes=True
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProductImage.sort_order",
    )


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(
        GUID(),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    sku: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    size: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color: Mapped[str | None] = mapped_column(String(100), nullable=True)
    shape: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pieces_per_box: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    price_per_piece_rub: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    price_per_piece_usd: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # Габариты товара (мм)
    length_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    width_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Физические характеристики
    weight_gr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    burn_time_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Упаковка / транспортная коробка (ТК)
    packages_per_box: Mapped[int | None] = mapped_column(Integer, nullable=True)
    box_length_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    box_width_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    box_height_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    box_weight_gr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stock_boxes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    reserved_boxes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(TZDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TZDateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    product: Mapped["Product"] = relationship(back_populates="variants")
    stock_movements: Mapped[list["StockMovement"]] = relationship(
        back_populates="variant", cascade="all, delete-orphan", passive_deletes=True
    )
    volume_discounts: Mapped[list["VolumeDiscount"]] = relationship(
        back_populates="variant", cascade="all, delete-orphan", passive_deletes=True,
        order_by="VolumeDiscount.min_boxes",
    )
    images: Mapped[list["VariantImage"]] = relationship(
        back_populates="variant", cascade="all, delete-orphan", passive_deletes=True,
        order_by="VariantImage.sort_order",
    )


class VolumeDiscount(Base):
    __tablename__ = "volume_discounts"
    __table_args__ = (
        UniqueConstraint("variant_id", "min_boxes", name="uq_volume_discount_variant_min"),
    )

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    variant_id: Mapped[UUID] = mapped_column(
        GUID(),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    min_boxes: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)

    variant: Mapped["ProductVariant"] = relationship(back_populates="volume_discounts")


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(
        GUID(),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    alt: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)

    product: Mapped["Product"] = relationship(back_populates="images")


class VariantImage(Base):
    __tablename__ = "variant_images"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    variant_id: Mapped[UUID] = mapped_column(
        GUID(),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    alt: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now(), nullable=False)

    variant: Mapped["ProductVariant"] = relationship(back_populates="images")
