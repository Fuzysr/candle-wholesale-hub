"""Seed 5 nicely-curated demo products with full data for visual review.

Each product gets:
  * 3-4 gallery images (Unsplash URLs verified to work)
  * 1-3 variants with all new dimension / weight / burn-time / TC fields
  * 2-3 volume-discount tiers (so the new mini-table on catalog cards shows up)
  * Material / scent / shape references resolved by slug

Idempotent — uses ON CONFLICT DO UPDATE on (slug) for products and on (sku) for
variants. Re-running is safe; existing rows are refreshed in place.

Run:
    docker compose exec backend python -m scripts.seed_demo_products
"""
from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import AsyncSessionLocal
from app.models.catalog import (
    Category,
    Material,
    Product,
    ProductImage,
    ProductVariant,
    Scent,
    Shape,
    VolumeDiscount,
)


# ---------------------------------------------------------------------------
# Reference categories (ensured if missing)
# ---------------------------------------------------------------------------

CATEGORIES = [
    {"slug": "aromatic", "name_ru": "Ароматические", "name_en": "Aromatic", "sort_order": 50},
    {"slug": "pillar", "name_ru": "Столбовые", "name_en": "Pillar", "sort_order": 20},
    {"slug": "decorative", "name_ru": "Декоративные", "name_en": "Decorative", "sort_order": 40},
    {"slug": "tealights", "name_ru": "Чайные", "name_en": "Tealights", "sort_order": 10},
    {"slug": "taper", "name_ru": "Столовые", "name_en": "Taper", "sort_order": 30},
]


# ---------------------------------------------------------------------------
# 5 demo products
# ---------------------------------------------------------------------------
#
# Image URLs are Unsplash IDs already used elsewhere in this codebase (so
# they're known-good). The `?w=1200&q=80&auto=format` query optimises for
# the gallery's larger viewport and gives a sharper image than the bare URL.
# ---------------------------------------------------------------------------

def img(photo_id: str, w: int = 1200) -> str:
    return f"https://images.unsplash.com/photo-{photo_id}?w={w}&q=80&auto=format&fit=crop"


PRODUCTS: list[dict] = [
    # 1. Аромасвеча — соевая, ваниль, в стакане
    {
        "slug": "demo-soy-vanilla-jar",
        "category_slug": "aromatic",
        "material_slug": "soy-wax",
        "scent_slug": "vanilla",
        "shape_slug": "cylinder",
        "name_ru": "Соевая аромасвеча «Ваниль и груша»",
        "name_en": "Soy candle “Vanilla & Pear”",
        "description_ru": (
            "Натуральная соевая свеча в стеклянном стакане. Тёплый аромат "
            "ванили и сочной груши наполняет помещение, не перебивая воздух. "
            "Время горения до 40 часов, ровное пламя без копоти."
        ),
        "description_en": "Natural soy candle in a glass jar. Warm vanilla & pear scent, 40h burn time.",
        "image_url": img("1602607616927-63f8e12e9c39"),
        "images": [
            img("1602607616927-63f8e12e9c39"),
            img("1599446220418-6a42680e3044"),
            img("1543610892-0b1f7e6d8ac1"),
        ],
        "variants": [
            {
                "sku": "DEMO-SOY-VAN-200", "size": "200 мл", "color": "Кремовый",
                "shape": "Цилиндр", "pieces_per_box": 12,
                "price_per_piece_rub": 380, "price_per_piece_usd": 4.20, "stock_boxes": 28,
                "length_mm": 75, "width_mm": 75, "height_mm": 95,
                "weight_gr": 220, "burn_time_hours": 40,
                "packages_per_box": 12,
                "box_length_mm": 320, "box_width_mm": 240, "box_height_mm": 110,
                "box_weight_gr": 3100,
                "discounts": [(5, 5), (15, 10), (30, 15)],
            },
            {
                "sku": "DEMO-SOY-VAN-400", "size": "400 мл", "color": "Кремовый",
                "shape": "Цилиндр", "pieces_per_box": 6,
                "price_per_piece_rub": 640, "price_per_piece_usd": 7.10, "stock_boxes": 16,
                "length_mm": 95, "width_mm": 95, "height_mm": 110,
                "weight_gr": 430, "burn_time_hours": 65,
                "packages_per_box": 6,
                "box_length_mm": 300, "box_width_mm": 200, "box_height_mm": 120,
                "box_weight_gr": 3200,
                "discounts": [(5, 6), (15, 12), (30, 18)],
            },
        ],
    },
    # 2. Столбовая — пчелиный воск
    {
        "slug": "demo-beeswax-pillar",
        "category_slug": "pillar",
        "material_slug": "beeswax",
        "scent_slug": "unscented",
        "shape_slug": "cylinder",
        "name_ru": "Столбовая свеча из пчелиного воска",
        "name_en": "Beeswax pillar candle",
        "description_ru": (
            "Классическая столбовая свеча из 100% пчелиного воска. Природный "
            "медовый аромат, тёплый янтарный оттенок. Подходит для ресторанов, "
            "банкетов и фотосъёмки."
        ),
        "description_en": "100% beeswax pillar. Natural honey scent and warm amber glow.",
        "image_url": img("1596178065887-1198b6148b2b"),
        "images": [
            img("1596178065887-1198b6148b2b"),
            img("1602874801007-bd458bb1b8b6"),
            img("1608755728617-aefab37d2edd"),
        ],
        "variants": [
            {
                "sku": "DEMO-BW-50-100", "size": "Ø50×100 мм", "color": "Медовый",
                "shape": "Цилиндр", "pieces_per_box": 8,
                "price_per_piece_rub": 520, "price_per_piece_usd": 5.80, "stock_boxes": 22,
                "length_mm": 50, "width_mm": 50, "height_mm": 100,
                "weight_gr": 210, "burn_time_hours": 30,
                "packages_per_box": 8,
                "box_length_mm": 220, "box_width_mm": 220, "box_height_mm": 110,
                "box_weight_gr": 1900,
                "discounts": [(4, 4), (12, 9), (25, 14)],
            },
            {
                "sku": "DEMO-BW-70-150", "size": "Ø70×150 мм", "color": "Медовый",
                "shape": "Цилиндр", "pieces_per_box": 4,
                "price_per_piece_rub": 920, "price_per_piece_usd": 10.20, "stock_boxes": 14,
                "length_mm": 70, "width_mm": 70, "height_mm": 150,
                "weight_gr": 480, "burn_time_hours": 60,
                "packages_per_box": 4,
                "box_length_mm": 240, "box_width_mm": 160, "box_height_mm": 160,
                "box_weight_gr": 2100,
                "discounts": [(3, 5), (10, 11), (20, 16)],
            },
        ],
    },
    # 3. Декоративная свеча-шар
    {
        "slug": "demo-decor-sphere",
        "category_slug": "decorative",
        "material_slug": "paraffin",
        "scent_slug": "unscented",
        "shape_slug": "sphere",
        "name_ru": "Декоративная свеча-шар «Геометрия»",
        "name_en": "Geometric sphere candle",
        "description_ru": (
            "Скульптурная свеча-шар с матовой текстурой. Хороший подарочный "
            "товар и универсальный декор для интерьерных съёмок и витрин."
        ),
        "description_en": "Sculptural sphere candle with matte finish — great for retail displays.",
        "image_url": img("1601181054013-b1c10b4afa74"),
        "images": [
            img("1601181054013-b1c10b4afa74"),
            img("1545249390-6bdfa286032f"),
            img("1543610892-0b1f7e6d8ac1"),
        ],
        "variants": [
            {
                "sku": "DEMO-SPH-80-WH", "size": "Ø80 мм", "color": "Белый",
                "shape": "Шар", "pieces_per_box": 12,
                "price_per_piece_rub": 260, "price_per_piece_usd": 2.90, "stock_boxes": 20,
                "length_mm": 80, "width_mm": 80, "height_mm": 80,
                "weight_gr": 240, "burn_time_hours": 20,
                "packages_per_box": 12,
                "box_length_mm": 340, "box_width_mm": 260, "box_height_mm": 90,
                "box_weight_gr": 3200,
                "discounts": [(5, 5), (15, 10), (40, 16)],
            },
            {
                "sku": "DEMO-SPH-80-GR", "size": "Ø80 мм", "color": "Серый",
                "shape": "Шар", "pieces_per_box": 12,
                "price_per_piece_rub": 280, "price_per_piece_usd": 3.10, "stock_boxes": 12,
                "length_mm": 80, "width_mm": 80, "height_mm": 80,
                "weight_gr": 240, "burn_time_hours": 20,
                "packages_per_box": 12,
                "box_length_mm": 340, "box_width_mm": 260, "box_height_mm": 90,
                "box_weight_gr": 3200,
                "discounts": [(5, 5), (15, 10), (40, 16)],
            },
            {
                "sku": "DEMO-SPH-100-WH", "size": "Ø100 мм", "color": "Белый",
                "shape": "Шар", "pieces_per_box": 8,
                "price_per_piece_rub": 360, "price_per_piece_usd": 4.00, "stock_boxes": 9,
                "length_mm": 100, "width_mm": 100, "height_mm": 100,
                "weight_gr": 380, "burn_time_hours": 32,
                "packages_per_box": 8,
                "box_length_mm": 420, "box_width_mm": 220, "box_height_mm": 110,
                "box_weight_gr": 3300,
                "discounts": [(4, 6), (12, 11), (30, 17)],
            },
        ],
    },
    # 4. Аромасвеча — лаванда
    {
        "slug": "demo-soy-lavender",
        "category_slug": "aromatic",
        "material_slug": "soy-wax",
        "scent_slug": "lavender",
        "shape_slug": "cylinder",
        "name_ru": "Аромасвеча «Лаванда и эвкалипт»",
        "name_en": "Lavender & eucalyptus candle",
        "description_ru": (
            "Расслабляющая композиция лаванды и эвкалипта на базе соевого воска. "
            "Свежий хвойный финал, идеально для спа и уютных вечеров."
        ),
        "description_en": "Relaxing lavender & eucalyptus blend on soy wax base.",
        "image_url": img("1599446220418-6a42680e3044"),
        "images": [
            img("1599446220418-6a42680e3044"),
            img("1602607616927-63f8e12e9c39"),
            img("1574263867128-a3d5c1b1decc"),
        ],
        "variants": [
            {
                "sku": "DEMO-LAV-200", "size": "200 мл", "color": "Лиловый",
                "shape": "Цилиндр", "pieces_per_box": 12,
                "price_per_piece_rub": 390, "price_per_piece_usd": 4.30, "stock_boxes": 24,
                "length_mm": 75, "width_mm": 75, "height_mm": 95,
                "weight_gr": 220, "burn_time_hours": 38,
                "packages_per_box": 12,
                "box_length_mm": 320, "box_width_mm": 240, "box_height_mm": 110,
                "box_weight_gr": 3100,
                "discounts": [(5, 5), (15, 10), (30, 15)],
            },
        ],
    },
    # 5. Чайные свечи — премиум, набор 50 шт.
    {
        "slug": "demo-tealights-premium-50",
        "category_slug": "tealights",
        "material_slug": "soy-wax",
        "scent_slug": "unscented",
        "shape_slug": "cylinder",
        "name_ru": "Чайные свечи Premium «Натуральные» (50 шт.)",
        "name_en": "Premium tealights, pack of 50",
        "description_ru": (
            "Большая упаковка чайных свечей в алюминиевых гильзах. Без запаха, "
            "ровное горение 4 часа. Удобны для HoReCa, банкетов и террас."
        ),
        "description_en": "Bulk pack of tealights in aluminum cups. Unscented, 4h burn.",
        "image_url": img("1603006905003-be475563bc59"),
        "images": [
            img("1603006905003-be475563bc59"),
            img("1545249390-6bdfa286032f"),
            img("1602874801007-bd458bb1b8b6"),
        ],
        "variants": [
            {
                "sku": "DEMO-TL-50-NAT", "size": "Ø38×16 мм", "color": "Натуральный",
                "shape": "Цилиндр", "pieces_per_box": 50,
                "price_per_piece_rub": 14, "price_per_piece_usd": 0.16, "stock_boxes": 80,
                "length_mm": 38, "width_mm": 38, "height_mm": 16,
                "weight_gr": 12, "burn_time_hours": 4,
                "packages_per_box": 12,
                "box_length_mm": 380, "box_width_mm": 290, "box_height_mm": 220,
                "box_weight_gr": 8400,
                "discounts": [(5, 4), (20, 8), (50, 14)],
            },
            {
                "sku": "DEMO-TL-50-WH", "size": "Ø38×16 мм", "color": "Белый",
                "shape": "Цилиндр", "pieces_per_box": 50,
                "price_per_piece_rub": 15, "price_per_piece_usd": 0.17, "stock_boxes": 60,
                "length_mm": 38, "width_mm": 38, "height_mm": 16,
                "weight_gr": 12, "burn_time_hours": 4,
                "packages_per_box": 12,
                "box_length_mm": 380, "box_width_mm": 290, "box_height_mm": 220,
                "box_weight_gr": 8400,
                "discounts": [(5, 4), (20, 8), (50, 14)],
            },
        ],
    },
]


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------


async def ensure_categories(session) -> dict[str, UUID]:
    out: dict[str, UUID] = {}
    for c in CATEGORIES:
        stmt = pg_insert(Category).values(**c)
        stmt = stmt.on_conflict_do_update(
            index_elements=["slug"],
            set_={k: stmt.excluded[k] for k in c if k != "slug"},
        ).returning(Category.id)
        cid = (await session.execute(stmt)).scalar_one()
        out[c["slug"]] = cid
    return out


async def get_id_map(session, model, slugs: set[str]) -> dict[str, UUID]:
    if not slugs:
        return {}
    rows = (await session.execute(select(model.slug, model.id).where(model.slug.in_(slugs)))).all()
    return {slug: rid for slug, rid in rows}


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        cat_ids = await ensure_categories(session)

        material_slugs = {p["material_slug"] for p in PRODUCTS if p.get("material_slug")}
        scent_slugs = {p["scent_slug"] for p in PRODUCTS if p.get("scent_slug")}
        shape_slugs = {p["shape_slug"] for p in PRODUCTS if p.get("shape_slug")}

        material_ids = await get_id_map(session, Material, material_slugs)
        scent_ids = await get_id_map(session, Scent, scent_slugs)
        shape_ids = await get_id_map(session, Shape, shape_slugs)

        await session.commit()

        for p in PRODUCTS:
            prod_values = {
                "slug": p["slug"],
                "category_id": cat_ids[p["category_slug"]],
                "material_id": material_ids.get(p.get("material_slug", "")),
                "scent_id": scent_ids.get(p.get("scent_slug", "")),
                "shape_id": shape_ids.get(p.get("shape_slug", "")),
                "name_ru": p["name_ru"],
                "name_en": p["name_en"],
                "description_ru": p["description_ru"],
                "description_en": p["description_en"],
                "image_url": p["image_url"],
                "is_published": True,
            }
            stmt = pg_insert(Product).values(**prod_values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["slug"],
                set_={k: stmt.excluded[k] for k in prod_values if k != "slug"},
            ).returning(Product.id)
            product_id = (await session.execute(stmt)).scalar_one()

            # Refresh gallery: drop existing and re-insert in declared order.
            await session.execute(
                delete(ProductImage).where(ProductImage.product_id == product_id)
            )
            for i, url in enumerate(p["images"]):
                session.add(
                    ProductImage(
                        product_id=product_id,
                        url=url,
                        alt=p["name_ru"],
                        sort_order=i,
                    )
                )

            for v in p["variants"]:
                discounts = v.pop("discounts", [])
                v_values = {**v, "product_id": product_id}
                v_stmt = pg_insert(ProductVariant).values(**v_values)
                v_stmt = v_stmt.on_conflict_do_update(
                    index_elements=["sku"],
                    set_={k: v_stmt.excluded[k] for k in v_values if k not in ("sku", "product_id")},
                ).returning(ProductVariant.id)
                variant_id = (await session.execute(v_stmt)).scalar_one()

                # Replace volume discounts entirely so re-runs stay clean.
                await session.execute(
                    delete(VolumeDiscount).where(VolumeDiscount.variant_id == variant_id)
                )
                for min_boxes, percent in discounts:
                    session.add(
                        VolumeDiscount(
                            variant_id=variant_id,
                            min_boxes=min_boxes,
                            discount_percent=percent,
                        )
                    )

            print(f"[ok] {p['slug']} — {len(p['variants'])} variants, {len(p['images'])} images")

        await session.commit()
        print()
        print(f"[done] {len(PRODUCTS)} demo products ready in catalog")


if __name__ == "__main__":
    asyncio.run(seed())
