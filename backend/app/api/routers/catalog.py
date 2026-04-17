"""Catalog endpoints: categories, attributes, products, variants, images.

Public reads live under the root prefix. Admin-only writes live under `/admin`
and require `require_admin`. The shape of the product responses mirrors what
the old Supabase nested `select()` returned, so the frontend rewrite can be
done one component at a time.
"""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import db_session, require_admin
from app.models.catalog import (
    Category,
    Material,
    Product,
    ProductImage,
    ProductVariant,
    Scent,
    Shape,
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
    ProductUpdate,
    ProductVariantCreate,
    ProductVariantOut,
    ProductVariantUpdate,
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
    return select(Product).options(
        selectinload(Product.variants),
        selectinload(Product.images),
        selectinload(Product.category),
        selectinload(Product.material),
        selectinload(Product.scent),
        selectinload(Product.shape),
    )


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
async def list_products(session: AsyncSession = Depends(db_session)) -> list[Product]:
    """List published products with variants / images / attributes loaded."""
    res = await session.scalars(
        _product_query().where(Product.is_published.is_(True)).order_by(Product.name_ru)
    )
    return list(res.unique().all())


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
async def admin_list_products(session: AsyncSession = Depends(db_session)) -> list[Product]:
    res = await session.scalars(_product_query().order_by(Product.name_ru))
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
    await session.refresh(variant)
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
    await session.refresh(variant)
    return variant


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
