"""Catalog endpoints: categories, attributes, products, variants, images.

Public reads live under the root prefix. Admin-only writes live under `/admin`
and require `require_admin`. The shape of the product responses mirrors what
the old Supabase nested `select()` returned, so the frontend rewrite can be
done one component at a time.
"""
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import db_session, require_admin
from app.api.pagination import PaginationParams, pagination_params
from app.models.catalog import (
    Category,
    Material,
    Product,
    ProductImage,
    ProductVariant,
    Scent,
    Shape,
    VariantImage,
    VolumeDiscount,
)
from app.schemas.catalog import (
    AttributeCreate,
    AttributeOut,
    AttributeUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    ProductCreate,
    ProductImageCreate,
    ProductImageOut,
    ProductImageUpdate,
    ProductOut,
    ProductPageOut,
    ProductUpdate,
    ProductVariantCreate,
    ProductVariantOut,
    ProductVariantUpdate,
    VariantImageCreate,
    VariantImageOut,
    VariantImageUpdate,
    VolumeDiscountCreate,
    VolumeDiscountOut,
    VolumeDiscountUpdate,
)

router = APIRouter(tags=["catalog"])


AttrKind = Literal["materials", "scents", "shapes"]
_ATTR_MODELS = {"materials": Material, "scents": Scent, "shapes": Shape}


def _attribute_model(kind: AttrKind):
    try:
        return _ATTR_MODELS[kind]
    except KeyError as exc:  # pragma: no cover - pydantic validates Literal
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="unknown attribute") from exc


def _product_query():
    variant_loader = selectinload(Product.variants)
    return select(Product).options(
        variant_loader.selectinload(ProductVariant.volume_discounts),
        variant_loader.selectinload(ProductVariant.images),
        selectinload(Product.images),
        selectinload(Product.category),
        selectinload(Product.material),
        selectinload(Product.scent),
        selectinload(Product.shape),
    )


ProductSort = Literal["newest", "name", "stock", "price-asc", "price-desc"]
CatalogLanguage = Literal["ru", "en"]
CatalogCurrency = Literal["RUB", "USD"]


def _apply_product_filters(
    stmt,
    *,
    category_ids: list[UUID],
    material_ids: list[UUID],
    scent_ids: list[UUID],
    shape_ids: list[UUID],
    colors: list[str],
    q: str | None,
    in_stock: bool | None,
    price_min: Decimal | None,
    price_max: Decimal | None,
    length_min: Decimal | None,
    length_max: Decimal | None,
    width_min: Decimal | None,
    width_max: Decimal | None,
    height_min: Decimal | None,
    height_max: Decimal | None,
    currency: CatalogCurrency,
):
    if category_ids:
        stmt = stmt.where(Product.category_id.in_(category_ids))
    if material_ids:
        stmt = stmt.where(Product.material_id.in_(material_ids))
    if scent_ids:
        stmt = stmt.where(Product.scent_id.in_(scent_ids))
    if shape_ids:
        stmt = stmt.where(Product.shape_id.in_(shape_ids))
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name_ru.ilike(pattern),
                Product.name_en.ilike(pattern),
                Product.description_ru.ilike(pattern),
                Product.description_en.ilike(pattern),
                Product.variants.any(ProductVariant.sku.ilike(pattern)),
            )
        )
    variant_filters = []
    if in_stock is True:
        variant_filters.append(ProductVariant.stock_boxes > ProductVariant.reserved_boxes)
    if colors:
        variant_filters.append(ProductVariant.color.in_(colors))
    price = (
        ProductVariant.price_per_piece_rub
        if currency == "RUB"
        else ProductVariant.price_per_piece_usd
    ) * ProductVariant.pieces_per_box
    if price_min is not None:
        variant_filters.append(price >= price_min)
    if price_max is not None:
        variant_filters.append(price <= price_max)
    for column, minimum, maximum in (
        (ProductVariant.length_mm, length_min, length_max),
        (ProductVariant.width_mm, width_min, width_max),
        (ProductVariant.height_mm, height_min, height_max),
    ):
        if minimum is not None:
            variant_filters.append(column >= minimum)
        if maximum is not None:
            variant_filters.append(column <= maximum)
    if variant_filters:
        stmt = stmt.where(Product.variants.any(and_(*variant_filters)))
    return stmt


def _product_order(
    sort: ProductSort, language: CatalogLanguage, currency: CatalogCurrency
):
    stock = (
        select(func.coalesce(func.sum(ProductVariant.stock_boxes), 0))
        .where(ProductVariant.product_id == Product.id)
        .correlate(Product)
        .scalar_subquery()
    )
    price_column = (
        ProductVariant.price_per_piece_rub
        if currency == "RUB"
        else ProductVariant.price_per_piece_usd
    )
    min_box_price = (
        select(func.min(price_column * ProductVariant.pieces_per_box))
        .where(ProductVariant.product_id == Product.id)
        .correlate(Product)
        .scalar_subquery()
    )
    if sort == "name":
        name = Product.name_ru if language == "ru" else Product.name_en
        return (name.asc(), Product.id.asc())
    if sort == "stock":
        return (stock.desc(), Product.name_ru.asc(), Product.id.asc())
    if sort == "price-asc":
        return (min_box_price.is_(None), min_box_price.asc(), Product.id.asc())
    if sort == "price-desc":
        return (min_box_price.is_(None), min_box_price.desc(), Product.id.asc())
    return (Product.created_at.desc(), Product.id.desc())


# ========================================================================
# Public: categories
# ========================================================================


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(session: AsyncSession = Depends(db_session)) -> list[Category]:
    res = await session.scalars(select(Category).order_by(Category.sort_order, Category.name_ru))
    return list(res.all())


# ========================================================================
# Public: attributes (materials / scents / shapes)
# ========================================================================


@router.get("/attributes/{kind}", response_model=list[AttributeOut])
async def list_attributes(kind: AttrKind, session: AsyncSession = Depends(db_session)):
    model = _attribute_model(kind)
    res = await session.scalars(select(model).order_by(model.sort_order, model.name_ru))
    return list(res.all())


# ========================================================================
# Public: products
# ========================================================================


@router.get("/products", response_model=list[ProductOut])
async def list_products(
    p: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(db_session),
) -> list[Product]:
    """List published products with variants / images / attributes loaded."""
    res = await session.scalars(
        _product_query()
        .where(Product.is_published.is_(True))
        # A unique tie-breaker is required for offset pagination. Without it,
        # products sharing a name may move between pages and be skipped or
        # duplicated even when the dataset itself has not changed.
        .order_by(Product.name_ru, Product.id)
        .offset(p.offset)
        .limit(p.limit)
    )
    return list(res.unique().all())


@router.get("/products/search", response_model=ProductPageOut)
async def search_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    category_ids: list[UUID] = Query(default=[]),
    material_ids: list[UUID] = Query(default=[]),
    scent_ids: list[UUID] = Query(default=[]),
    shape_ids: list[UUID] = Query(default=[]),
    colors: list[str] = Query(default=[]),
    q: str | None = Query(None, max_length=200),
    in_stock: bool | None = None,
    price_min: Decimal | None = Query(None, ge=0),
    price_max: Decimal | None = Query(None, ge=0),
    length_min: Decimal | None = Query(None, ge=0),
    length_max: Decimal | None = Query(None, ge=0),
    width_min: Decimal | None = Query(None, ge=0),
    width_max: Decimal | None = Query(None, ge=0),
    height_min: Decimal | None = Query(None, ge=0),
    height_max: Decimal | None = Query(None, ge=0),
    sort: ProductSort = "newest",
    language: CatalogLanguage = "ru",
    currency: CatalogCurrency = "RUB",
    session: AsyncSession = Depends(db_session),
) -> ProductPageOut:
    """Filter and paginate the public catalog without loading it wholesale."""
    filters = {
        "category_ids": category_ids,
        "material_ids": material_ids,
        "scent_ids": scent_ids,
        "shape_ids": shape_ids,
        "colors": colors,
        "q": q,
        "in_stock": in_stock,
        "price_min": price_min,
        "price_max": price_max,
        "length_min": length_min,
        "length_max": length_max,
        "width_min": width_min,
        "width_max": width_max,
        "height_min": height_min,
        "height_max": height_max,
        "currency": currency,
    }
    base = _apply_product_filters(
        select(Product).where(Product.is_published.is_(True)), **filters
    )
    total = int(
        await session.scalar(select(func.count()).select_from(base.subquery())) or 0
    )
    pages = (total + page_size - 1) // page_size
    rows = await session.scalars(
        _apply_product_filters(
            _product_query().where(Product.is_published.is_(True)), **filters
        )
        .order_by(*_product_order(sort, language, currency))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return ProductPageOut(
        items=list(rows.unique().all()),
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        has_next=page < pages,
        has_previous=page > 1 and total > 0,
    )


@router.get("/products/colors", response_model=list[str])
async def list_product_colors(session: AsyncSession = Depends(db_session)) -> list[str]:
    """Return stable public filter options without downloading the catalog."""
    rows = await session.scalars(
        select(ProductVariant.color)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(Product.is_published.is_(True), ProductVariant.color.is_not(None))
        .distinct()
        .order_by(ProductVariant.color)
    )
    return [color for color in rows.all() if color]


@router.get("/products/{slug}", response_model=ProductOut)
async def get_product_by_slug(slug: str, session: AsyncSession = Depends(db_session)) -> Product:
    product = await session.scalar(_product_query().where(Product.slug == slug))
    if product is None or not product.is_published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")
    return product


# ========================================================================
# Admin: products list (includes drafts)
# ========================================================================


@router.get("/admin/products", response_model=list[ProductOut], dependencies=[Depends(require_admin)])
async def admin_list_products(
    p: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(db_session),
) -> list[Product]:
    res = await session.scalars(
        _product_query()
        .order_by(Product.name_ru, Product.id)
        .offset(p.offset)
        .limit(p.limit)
    )
    return list(res.unique().all())


# ========================================================================
# Admin: categories
# ========================================================================


@router.post(
    "/admin/categories",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_category(payload: CategoryCreate, session: AsyncSession = Depends(db_session)) -> Category:
    category = Category(**payload.model_dump())
    session.add(category)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="slug already used") from exc
    await session.refresh(category)
    return category


@router.patch(
    "/admin/categories/{category_id}",
    response_model=CategoryOut,
    dependencies=[Depends(require_admin)],
)
async def update_category(
    category_id: UUID,
    payload: CategoryUpdate,
    session: AsyncSession = Depends(db_session),
) -> Category:
    category = await session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="category not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(category, k, v)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="slug already used") from exc
    await session.refresh(category)
    return category


@router.delete(
    "/admin/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_category(category_id: UUID, session: AsyncSession = Depends(db_session)) -> None:
    category = await session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="category not found")
    await session.delete(category)
    await session.commit()


# ========================================================================
# Admin: attributes (materials / scents / shapes)
# ========================================================================


@router.post(
    "/admin/attributes/{kind}",
    response_model=AttributeOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_attribute(
    kind: AttrKind,
    payload: AttributeCreate,
    session: AsyncSession = Depends(db_session),
):
    model = _attribute_model(kind)
    row = model(**payload.model_dump())
    session.add(row)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="slug already used") from exc
    await session.refresh(row)
    return row


@router.patch(
    "/admin/attributes/{kind}/{attr_id}",
    response_model=AttributeOut,
    dependencies=[Depends(require_admin)],
)
async def update_attribute(
    kind: AttrKind,
    attr_id: UUID,
    payload: AttributeUpdate,
    session: AsyncSession = Depends(db_session),
):
    model = _attribute_model(kind)
    row = await session.get(model, attr_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="attribute not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="slug already used") from exc
    await session.refresh(row)
    return row


@router.delete(
    "/admin/attributes/{kind}/{attr_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_attribute(
    kind: AttrKind, attr_id: UUID, session: AsyncSession = Depends(db_session)
) -> None:
    model = _attribute_model(kind)
    row = await session.get(model, attr_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="attribute not found")
    await session.delete(row)
    await session.commit()


# ========================================================================
# Admin: products
# ========================================================================


async def _load_full_product(session: AsyncSession, product_id: UUID) -> Product:
    product = await session.scalar(_product_query().where(Product.id == product_id))
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")
    return product


@router.post(
    "/admin/products",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_product(payload: ProductCreate, session: AsyncSession = Depends(db_session)) -> Product:
    product = Product(**payload.model_dump())
    session.add(product)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="slug already used") from exc
    return await _load_full_product(session, product.id)


@router.patch(
    "/admin/products/{product_id}",
    response_model=ProductOut,
    dependencies=[Depends(require_admin)],
)
async def update_product(
    product_id: UUID,
    payload: ProductUpdate,
    session: AsyncSession = Depends(db_session),
) -> Product:
    product = await session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="slug already used") from exc
    return await _load_full_product(session, product_id)


@router.delete(
    "/admin/products/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_product(product_id: UUID, session: AsyncSession = Depends(db_session)) -> None:
    product = await session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")
    await session.delete(product)
    await session.commit()


# ========================================================================
# Admin: product variants
# ========================================================================


@router.post(
    "/admin/products/{product_id}/variants",
    response_model=ProductVariantOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_variant(
    product_id: UUID,
    payload: ProductVariantCreate,
    session: AsyncSession = Depends(db_session),
) -> ProductVariant:
    product = await session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")
    variant = ProductVariant(product_id=product_id, **payload.model_dump())
    session.add(variant)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="SKU already used") from exc
    return await _load_full_variant(session, variant.id)


async def _load_full_variant(session: AsyncSession, variant_id: UUID) -> ProductVariant:
    variant = await session.scalar(
        select(ProductVariant)
        .options(
            selectinload(ProductVariant.volume_discounts),
            selectinload(ProductVariant.images),
        )
        .where(ProductVariant.id == variant_id)
    )
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="variant not found")
    return variant


@router.patch(
    "/admin/variants/{variant_id}",
    response_model=ProductVariantOut,
    dependencies=[Depends(require_admin)],
)
async def update_variant(
    variant_id: UUID,
    payload: ProductVariantUpdate,
    session: AsyncSession = Depends(db_session),
) -> ProductVariant:
    variant = await session.get(ProductVariant, variant_id)
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="variant not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(variant, k, v)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="SKU already used") from exc
    return await _load_full_variant(session, variant_id)


@router.delete(
    "/admin/variants/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_variant(variant_id: UUID, session: AsyncSession = Depends(db_session)) -> None:
    variant = await session.get(ProductVariant, variant_id)
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="variant not found")
    await session.delete(variant)
    await session.commit()


# ========================================================================
# Admin: product images
# ========================================================================


@router.post(
    "/admin/products/{product_id}/images",
    response_model=ProductImageOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_image(
    product_id: UUID,
    payload: ProductImageCreate,
    session: AsyncSession = Depends(db_session),
) -> ProductImage:
    product = await session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")
    image = ProductImage(product_id=product_id, **payload.model_dump())
    session.add(image)
    await session.commit()
    await session.refresh(image)
    return image


@router.patch(
    "/admin/images/{image_id}",
    response_model=ProductImageOut,
    dependencies=[Depends(require_admin)],
)
async def update_image(
    image_id: UUID,
    payload: ProductImageUpdate,
    session: AsyncSession = Depends(db_session),
) -> ProductImage:
    image = await session.get(ProductImage, image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="image not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(image, k, v)
    await session.commit()
    await session.refresh(image)
    return image


@router.delete(
    "/admin/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_image(image_id: UUID, session: AsyncSession = Depends(db_session)) -> None:
    image = await session.get(ProductImage, image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="image not found")
    await session.delete(image)
    await session.commit()


# ========================================================================
# Admin: volume discounts (per-variant)
# ========================================================================


@router.get(
    "/variants/{variant_id}/volume-discounts",
    response_model=list[VolumeDiscountOut],
)
async def list_volume_discounts(
    variant_id: UUID, session: AsyncSession = Depends(db_session)
) -> list[VolumeDiscount]:
    variant = await session.get(ProductVariant, variant_id)
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="variant not found")
    res = await session.scalars(
        select(VolumeDiscount)
        .where(VolumeDiscount.variant_id == variant_id)
        .order_by(VolumeDiscount.min_boxes)
    )
    return list(res.all())


@router.post(
    "/admin/variants/{variant_id}/volume-discounts",
    response_model=VolumeDiscountOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_volume_discount(
    variant_id: UUID,
    payload: VolumeDiscountCreate,
    session: AsyncSession = Depends(db_session),
) -> VolumeDiscount:
    variant = await session.get(ProductVariant, variant_id)
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="variant not found")
    tier = VolumeDiscount(variant_id=variant_id, **payload.model_dump())
    session.add(tier)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="min_boxes already exists for this variant",
        ) from exc
    await session.refresh(tier)
    return tier


@router.patch(
    "/admin/volume-discounts/{discount_id}",
    response_model=VolumeDiscountOut,
    dependencies=[Depends(require_admin)],
)
async def update_volume_discount(
    discount_id: UUID,
    payload: VolumeDiscountUpdate,
    session: AsyncSession = Depends(db_session),
) -> VolumeDiscount:
    tier = await session.get(VolumeDiscount, discount_id)
    if tier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="discount not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tier, k, v)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="min_boxes already exists for this variant",
        ) from exc
    await session.refresh(tier)
    return tier


@router.delete(
    "/admin/volume-discounts/{discount_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_volume_discount(
    discount_id: UUID, session: AsyncSession = Depends(db_session)
) -> None:
    tier = await session.get(VolumeDiscount, discount_id)
    if tier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="discount not found")
    await session.delete(tier)
    await session.commit()


@router.put(
    "/admin/variants/{variant_id}/volume-discounts",
    response_model=list[VolumeDiscountOut],
    dependencies=[Depends(require_admin)],
)
async def replace_volume_discounts(
    variant_id: UUID,
    payload: list[VolumeDiscountCreate],
    session: AsyncSession = Depends(db_session),
) -> list[VolumeDiscount]:
    """Replace all volume discount tiers for a variant at once."""
    variant = await session.get(ProductVariant, variant_id)
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="variant not found")
    # Delete existing
    existing = await session.scalars(
        select(VolumeDiscount).where(VolumeDiscount.variant_id == variant_id)
    )
    for row in existing.all():
        await session.delete(row)
    await session.flush()
    # Insert new
    tiers: list[VolumeDiscount] = []
    for item in payload:
        tier = VolumeDiscount(variant_id=variant_id, **item.model_dump())
        session.add(tier)
        tiers.append(tier)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="duplicate min_boxes in payload",
        ) from exc
    for t in tiers:
        await session.refresh(t)
    return sorted(tiers, key=lambda t: t.min_boxes)


# ========================================================================
# Admin: variant images
# ========================================================================


@router.post(
    "/admin/variants/{variant_id}/images",
    response_model=VariantImageOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_variant_image(
    variant_id: UUID,
    payload: VariantImageCreate,
    session: AsyncSession = Depends(db_session),
) -> VariantImage:
    variant = await session.get(ProductVariant, variant_id)
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="variant not found")
    img = VariantImage(variant_id=variant_id, **payload.model_dump())
    session.add(img)
    await session.commit()
    await session.refresh(img)
    return img


@router.patch(
    "/admin/variant-images/{image_id}",
    response_model=VariantImageOut,
    dependencies=[Depends(require_admin)],
)
async def update_variant_image(
    image_id: UUID,
    payload: VariantImageUpdate,
    session: AsyncSession = Depends(db_session),
) -> VariantImage:
    img = await session.get(VariantImage, image_id)
    if img is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="image not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(img, k, v)
    await session.commit()
    await session.refresh(img)
    return img


@router.delete(
    "/admin/variant-images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_variant_image(
    image_id: UUID,
    session: AsyncSession = Depends(db_session),
) -> None:
    img = await session.get(VariantImage, image_id)
    if img is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="image not found")
    await session.delete(img)
    await session.commit()
