from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class _ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Attribute lookups (materials / scents / shapes) ----------


class AttributeOut(_ORM):
    id: UUID
    slug: str
    name_ru: str
    name_en: str
    sort_order: int
    created_at: datetime


class AttributeCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=64)
    name_ru: str = Field(min_length=1)
    name_en: str = Field(min_length=1)
    sort_order: int = 0


class AttributeUpdate(BaseModel):
    slug: str | None = None
    name_ru: str | None = None
    name_en: str | None = None
    sort_order: int | None = None


# ---------- Categories ----------


class CategoryOut(_ORM):
    id: UUID
    slug: str
    name_ru: str
    name_en: str
    icon: str | None = None
    parent_id: UUID | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class CategoryCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=128)
    name_ru: str = Field(min_length=1)
    name_en: str = Field(min_length=1)
    icon: str | None = Field(default=None, max_length=64)
    parent_id: UUID | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    slug: str | None = None
    name_ru: str | None = None
    name_en: str | None = None
    icon: str | None = Field(default=None, max_length=64)
    parent_id: UUID | None = None
    sort_order: int | None = None


class CategoryRef(_ORM):
    slug: str
    name_ru: str
    name_en: str


# ---------- Volume discounts ----------


class VolumeDiscountOut(_ORM):
    id: UUID
    variant_id: UUID
    min_boxes: int
    discount_percent: float
    created_at: datetime


class VolumeDiscountCreate(BaseModel):
    min_boxes: int = Field(ge=1)
    discount_percent: float = Field(gt=0, le=100)


class VolumeDiscountUpdate(BaseModel):
    min_boxes: int | None = Field(default=None, ge=1)
    discount_percent: float | None = Field(default=None, gt=0, le=100)


# ---------- Product variants & images ----------


class ProductVariantOut(_ORM):
    id: UUID
    product_id: UUID
    sku: str
    size: str | None
    color: str | None
    shape: str | None
    pieces_per_box: int
    price_per_piece_rub: float
    price_per_piece_usd: float
    # Габариты товара (мм)
    length_mm: int | None = None
    width_mm: int | None = None
    height_mm: int | None = None
    # Физические характеристики
    weight_gr: int | None = None
    burn_time_hours: int | None = None
    # Упаковка / транспортная коробка (ТК)
    packages_per_box: int | None = None
    box_length_mm: int | None = None
    box_width_mm: int | None = None
    box_height_mm: int | None = None
    box_weight_gr: int | None = None
    stock_boxes: int
    reserved_boxes: int
    image_url: str | None
    external_id: str | None
    last_synced_at: datetime | None
    created_at: datetime
    updated_at: datetime
    volume_discounts: list[VolumeDiscountOut] = []
    images: list["VariantImageOut"] = []


class ProductVariantCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=128)
    size: str | None = None
    color: str | None = None
    shape: str | None = None
    pieces_per_box: int = Field(ge=1, default=1)
    price_per_piece_rub: float = Field(ge=0)
    price_per_piece_usd: float = Field(ge=0)
    length_mm: int | None = Field(default=None, ge=0)
    width_mm: int | None = Field(default=None, ge=0)
    height_mm: int | None = Field(default=None, ge=0)
    weight_gr: int | None = Field(default=None, ge=0)
    burn_time_hours: int | None = Field(default=None, ge=0)
    packages_per_box: int | None = Field(default=None, ge=1)
    box_length_mm: int | None = Field(default=None, ge=0)
    box_width_mm: int | None = Field(default=None, ge=0)
    box_height_mm: int | None = Field(default=None, ge=0)
    box_weight_gr: int | None = Field(default=None, ge=0)
    stock_boxes: int = Field(ge=0, default=0)
    image_url: str | None = None
    external_id: str | None = None


class ProductVariantUpdate(BaseModel):
    sku: str | None = None
    size: str | None = None
    color: str | None = None
    shape: str | None = None
    pieces_per_box: int | None = Field(default=None, ge=1)
    price_per_piece_rub: float | None = Field(default=None, ge=0)
    price_per_piece_usd: float | None = Field(default=None, ge=0)
    length_mm: int | None = Field(default=None, ge=0)
    width_mm: int | None = Field(default=None, ge=0)
    height_mm: int | None = Field(default=None, ge=0)
    weight_gr: int | None = Field(default=None, ge=0)
    burn_time_hours: int | None = Field(default=None, ge=0)
    packages_per_box: int | None = Field(default=None, ge=1)
    box_length_mm: int | None = Field(default=None, ge=0)
    box_width_mm: int | None = Field(default=None, ge=0)
    box_height_mm: int | None = Field(default=None, ge=0)
    box_weight_gr: int | None = Field(default=None, ge=0)
    stock_boxes: int | None = Field(default=None, ge=0)
    image_url: str | None = None
    external_id: str | None = None


class VariantImageOut(_ORM):
    id: UUID
    variant_id: UUID
    url: str
    alt: str | None
    sort_order: int
    created_at: datetime


class VariantImageCreate(BaseModel):
    url: str = Field(min_length=1)
    alt: str | None = None
    sort_order: int = 0


class VariantImageUpdate(BaseModel):
    url: str | None = None
    alt: str | None = None
    sort_order: int | None = None


class ProductImageOut(_ORM):
    id: UUID
    product_id: UUID
    url: str
    alt: str | None
    sort_order: int
    created_at: datetime


class ProductImageCreate(BaseModel):
    url: str = Field(min_length=1)
    alt: str | None = None
    sort_order: int = 0


class ProductImageUpdate(BaseModel):
    url: str | None = None
    alt: str | None = None
    sort_order: int | None = None


# ---------- Products ----------


class ProductBase(_ORM):
    id: UUID
    slug: str
    category_id: UUID | None
    material_id: UUID | None
    scent_id: UUID | None
    shape_id: UUID | None
    name_ru: str
    name_en: str
    description_ru: str | None
    description_en: str | None
    image_url: str | None
    is_published: bool
    created_at: datetime
    updated_at: datetime


class ProductOut(ProductBase):
    variants: list[ProductVariantOut] = []
    images: list[ProductImageOut] = []
    category: CategoryRef | None = None
    material: AttributeOut | None = None
    scent: AttributeOut | None = None
    shape: AttributeOut | None = None


class ProductPageOut(BaseModel):
    """A stable metadata envelope for server-side catalog pagination."""

    items: list[ProductOut]
    total: int
    page: int
    page_size: int
    pages: int
    has_next: bool
    has_previous: bool


class ProductCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=128)
    category_id: UUID | None = None
    material_id: UUID | None = None
    scent_id: UUID | None = None
    shape_id: UUID | None = None
    name_ru: str = Field(min_length=1)
    name_en: str = Field(min_length=1)
    description_ru: str | None = None
    description_en: str | None = None
    image_url: str | None = None
    is_published: bool = True


class ProductUpdate(BaseModel):
    slug: str | None = None
    category_id: UUID | None = None
    material_id: UUID | None = None
    scent_id: UUID | None = None
    shape_id: UUID | None = None
    name_ru: str | None = None
    name_en: str | None = None
    description_ru: str | None = None
    description_en: str | None = None
    image_url: str | None = None
    is_published: bool | None = None
