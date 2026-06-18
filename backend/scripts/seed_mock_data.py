"""Seed mock data: materials, scents, shapes + extra products with variants & images.

Run from the `backend/` directory:

    python -m scripts.seed_mock_data

Idempotent — uses ON CONFLICT DO UPDATE, safe to re-run.
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.catalog import (
    Category,
    Material,
    Product,
    ProductImage,
    ProductVariant,
    Scent,
    Shape,
)
from scripts._seed_utils import insert_if_absent, upsert

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

MATERIALS = [
    {"slug": "paraffin", "name_ru": "Парафин", "name_en": "Paraffin", "sort_order": 10},
    {"slug": "soy-wax", "name_ru": "Соевый воск", "name_en": "Soy wax", "sort_order": 20},
    {"slug": "beeswax", "name_ru": "Пчелиный воск", "name_en": "Beeswax", "sort_order": 30},
    {"slug": "palm-wax", "name_ru": "Пальмовый воск", "name_en": "Palm wax", "sort_order": 40},
    {"slug": "stearin", "name_ru": "Стеарин", "name_en": "Stearin", "sort_order": 50},
    {"slug": "coconut-wax", "name_ru": "Кокосовый воск", "name_en": "Coconut wax", "sort_order": 60},
]

SCENTS = [
    {"slug": "unscented", "name_ru": "Без запаха", "name_en": "Unscented", "sort_order": 0},
    {"slug": "vanilla", "name_ru": "Ваниль", "name_en": "Vanilla", "sort_order": 10},
    {"slug": "lavender", "name_ru": "Лаванда", "name_en": "Lavender", "sort_order": 20},
    {"slug": "cinnamon", "name_ru": "Корица", "name_en": "Cinnamon", "sort_order": 30},
    {"slug": "ocean-breeze", "name_ru": "Морской бриз", "name_en": "Ocean breeze", "sort_order": 40},
    {"slug": "sandalwood", "name_ru": "Сандал", "name_en": "Sandalwood", "sort_order": 50},
    {"slug": "rose", "name_ru": "Роза", "name_en": "Rose", "sort_order": 60},
    {"slug": "jasmine", "name_ru": "Жасмин", "name_en": "Jasmine", "sort_order": 70},
    {"slug": "cedar", "name_ru": "Кедр", "name_en": "Cedar", "sort_order": 80},
    {"slug": "citrus", "name_ru": "Цитрус", "name_en": "Citrus", "sort_order": 90},
]

SHAPES = [
    {"slug": "cylinder", "name_ru": "Цилиндр", "name_en": "Cylinder", "sort_order": 10},
    {"slug": "cone", "name_ru": "Конус", "name_en": "Cone", "sort_order": 20},
    {"slug": "sphere", "name_ru": "Шар", "name_en": "Sphere", "sort_order": 30},
    {"slug": "cube", "name_ru": "Куб", "name_en": "Cube", "sort_order": 40},
    {"slug": "star", "name_ru": "Звезда", "name_en": "Star", "sort_order": 50},
    {"slug": "spiral", "name_ru": "Спираль", "name_en": "Spiral", "sort_order": 60},
    {"slug": "figurine", "name_ru": "Фигурная", "name_en": "Figurine", "sort_order": 70},
]

# ---------------------------------------------------------------------------
# Additional categories (sub-categories)
# ---------------------------------------------------------------------------

EXTRA_CATEGORIES = [
    {"slug": "aromatic", "name_ru": "Ароматические", "name_en": "Aromatic", "sort_order": 50},
    {"slug": "church", "name_ru": "Церковные", "name_en": "Church candles", "sort_order": 60},
    {"slug": "floating", "name_ru": "Плавающие", "name_en": "Floating candles", "sort_order": 70},
    {"slug": "outdoor", "name_ru": "Для улицы", "name_en": "Outdoor", "sort_order": 80},
]

# ---------------------------------------------------------------------------
# Extra products — reference material/scent/shape by slug
# ---------------------------------------------------------------------------

EXTRA_PRODUCTS: list[dict] = [
    {
        "slug": "soy-vanilla-jar",
        "category_slug": "aromatic",
        "material_slug": "soy-wax",
        "scent_slug": "vanilla",
        "shape_slug": "cylinder",
        "name_ru": "Соевая свеча Ваниль в стакане",
        "name_en": "Soy vanilla jar candle",
        "description_ru": "Ароматическая свеча из натурального соевого воска с нотами ванили. Время горения 35 часов.",
        "description_en": "Natural soy wax scented candle with vanilla notes. 35h burn time.",
        "image_url": "https://images.unsplash.com/photo-1602607616927-63f8e12e9c39?w=800",
        "variants": [
            {"sku": "SOY-VAN-200", "size": "200 мл", "color": "Кремовый", "shape": "Цилиндр",
             "pieces_per_box": 12, "price_per_piece_rub": 350, "price_per_piece_usd": 3.85, "stock_boxes": 25},
            {"sku": "SOY-VAN-400", "size": "400 мл", "color": "Кремовый", "shape": "Цилиндр",
             "pieces_per_box": 6, "price_per_piece_rub": 580, "price_per_piece_usd": 6.40, "stock_boxes": 14},
        ],
        "images": [
            {"url": "https://images.unsplash.com/photo-1602607616927-63f8e12e9c39?w=800", "alt": "Соевая свеча ваниль — вид сверху", "sort_order": 0},
            {"url": "https://images.unsplash.com/photo-1572726729207-a78d6feb18d7?w=800", "alt": "Соевая свеча ваниль — горящая", "sort_order": 1},
        ],
    },
    {
        "slug": "soy-lavender-jar",
        "category_slug": "aromatic",
        "material_slug": "soy-wax",
        "scent_slug": "lavender",
        "shape_slug": "cylinder",
        "name_ru": "Соевая свеча Лаванда в стакане",
        "name_en": "Soy lavender jar candle",
        "description_ru": "Расслабляющий аромат прованской лаванды. Соевый воск, хлопковый фитиль.",
        "description_en": "Relaxing Provençal lavender. Soy wax, cotton wick.",
        "image_url": "https://images.unsplash.com/photo-1599446220418-6a42680e3044?w=800",
        "variants": [
            {"sku": "SOY-LAV-200", "size": "200 мл", "color": "Лиловый", "shape": "Цилиндр",
             "pieces_per_box": 12, "price_per_piece_rub": 360, "price_per_piece_usd": 3.95, "stock_boxes": 20},
            {"sku": "SOY-LAV-400", "size": "400 мл", "color": "Лиловый", "shape": "Цилиндр",
             "pieces_per_box": 6, "price_per_piece_rub": 590, "price_per_piece_usd": 6.50, "stock_boxes": 11},
        ],
        "images": [
            {"url": "https://images.unsplash.com/photo-1599446220418-6a42680e3044?w=800", "alt": "Свеча лаванда — упаковка", "sort_order": 0},
        ],
    },
    {
        "slug": "beeswax-pillar-natural",
        "category_slug": "pillar",
        "material_slug": "beeswax",
        "scent_slug": "unscented",
        "shape_slug": "cylinder",
        "name_ru": "Столбовая свеча из пчелиного воска",
        "name_en": "Natural beeswax pillar",
        "description_ru": "100% пчелиный воск, медовый оттенок, лёгкий натуральный аромат мёда. 60 часов горения.",
        "description_en": "100% beeswax, honey hue, subtle natural honey scent. 60h burn time.",
        "image_url": "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?w=800",
        "variants": [
            {"sku": "BW-NAT-70-150", "size": "Ø70×150 мм", "color": "Медовый", "shape": "Цилиндр",
             "pieces_per_box": 4, "price_per_piece_rub": 850, "price_per_piece_usd": 9.35, "stock_boxes": 10},
            {"sku": "BW-NAT-50-100", "size": "Ø50×100 мм", "color": "Медовый", "shape": "Цилиндр",
             "pieces_per_box": 8, "price_per_piece_rub": 480, "price_per_piece_usd": 5.30, "stock_boxes": 16},
        ],
        "images": [
            {"url": "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?w=800", "alt": "Пчелиный воск — столбовая", "sort_order": 0},
            {"url": "https://images.unsplash.com/photo-1607602132700-68b91e1ab04c?w=800", "alt": "Пчелиный воск — текстура", "sort_order": 1},
        ],
    },
    {
        "slug": "floating-rose",
        "category_slug": "floating",
        "material_slug": "paraffin",
        "scent_slug": "rose",
        "shape_slug": "figurine",
        "name_ru": "Плавающая свеча Роза",
        "name_en": "Floating rose candle",
        "description_ru": "Свеча в форме розы для декоративных ваз. 6 часов горения.",
        "description_en": "Rose-shaped floating candle for decorative bowls. 6h burn time.",
        "image_url": "https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=800",
        "variants": [
            {"sku": "FL-ROSE-PK", "size": "Ø60 мм", "color": "Розовый", "shape": "Роза",
             "pieces_per_box": 24, "price_per_piece_rub": 95, "price_per_piece_usd": 1.05, "stock_boxes": 18},
            {"sku": "FL-ROSE-W", "size": "Ø60 мм", "color": "Белый", "shape": "Роза",
             "pieces_per_box": 24, "price_per_piece_rub": 90, "price_per_piece_usd": 1.00, "stock_boxes": 22},
            {"sku": "FL-ROSE-RD", "size": "Ø60 мм", "color": "Красный", "shape": "Роза",
             "pieces_per_box": 24, "price_per_piece_rub": 95, "price_per_piece_usd": 1.05, "stock_boxes": 12},
        ],
        "images": [],
    },
    {
        "slug": "church-paraffin-400",
        "category_slug": "church",
        "material_slug": "paraffin",
        "scent_slug": "unscented",
        "shape_slug": "cylinder",
        "name_ru": "Церковная свеча парафиновая №2",
        "name_en": "Church paraffin candle #2",
        "description_ru": "Традиционная парафиновая церковная свеча, длина 40 см.",
        "description_en": "Traditional paraffin church candle, 40 cm long.",
        "image_url": "https://images.unsplash.com/photo-1545249390-6bdfa286032f?w=800",
        "variants": [
            {"sku": "CH-PAR-2-W", "size": "40 см", "color": "Белый", "shape": "Цилиндр",
             "pieces_per_box": 100, "price_per_piece_rub": 22, "price_per_piece_usd": 0.24, "stock_boxes": 50},
            {"sku": "CH-PAR-2-YL", "size": "40 см", "color": "Жёлтый", "shape": "Цилиндр",
             "pieces_per_box": 100, "price_per_piece_rub": 24, "price_per_piece_usd": 0.26, "stock_boxes": 35},
        ],
        "images": [],
    },
    {
        "slug": "stearin-taper-dinner",
        "category_slug": "taper",
        "material_slug": "stearin",
        "scent_slug": "unscented",
        "shape_slug": "cone",
        "name_ru": "Стеариновая столовая свеча 30 см",
        "name_en": "Stearin dinner taper 30 cm",
        "description_ru": "Высокая столовая свеча из стеарина, идеальна для праздничной сервировки. 10 часов горения.",
        "description_en": "Tall stearin dinner taper, ideal for festive table setting. 10h burn time.",
        "image_url": "https://images.unsplash.com/photo-1574263867128-a3d5c1b1decc?w=800",
        "variants": [
            {"sku": "ST-TP-W-30", "size": "30 см", "color": "Белый", "shape": "Конус",
             "pieces_per_box": 40, "price_per_piece_rub": 110, "price_per_piece_usd": 1.20, "stock_boxes": 17},
            {"sku": "ST-TP-BK-30", "size": "30 см", "color": "Чёрный", "shape": "Конус",
             "pieces_per_box": 40, "price_per_piece_rub": 115, "price_per_piece_usd": 1.25, "stock_boxes": 10},
            {"sku": "ST-TP-GD-30", "size": "30 см", "color": "Золотой", "shape": "Конус",
             "pieces_per_box": 40, "price_per_piece_rub": 130, "price_per_piece_usd": 1.45, "stock_boxes": 6},
        ],
        "images": [
            {"url": "https://images.unsplash.com/photo-1574263867128-a3d5c1b1decc?w=800", "alt": "Стеариновая столовая свеча", "sort_order": 0},
        ],
    },
    {
        "slug": "palm-cube-deco",
        "category_slug": "decorative",
        "material_slug": "palm-wax",
        "scent_slug": "sandalwood",
        "shape_slug": "cube",
        "name_ru": "Декоративная свеча-куб Сандал",
        "name_en": "Decorative sandalwood cube candle",
        "description_ru": "Пальмовый воск с кристаллической текстурой. Тёплый аромат сандала.",
        "description_en": "Palm wax with crystal texture. Warm sandalwood aroma.",
        "image_url": "https://images.unsplash.com/photo-1608181831718-2501ffef7f08?w=800",
        "variants": [
            {"sku": "PM-CUBE-80", "size": "80×80×80 мм", "color": "Песочный", "shape": "Куб",
             "pieces_per_box": 10, "price_per_piece_rub": 340, "price_per_piece_usd": 3.75, "stock_boxes": 8},
            {"sku": "PM-CUBE-60", "size": "60×60×60 мм", "color": "Песочный", "shape": "Куб",
             "pieces_per_box": 16, "price_per_piece_rub": 220, "price_per_piece_usd": 2.40, "stock_boxes": 13},
        ],
        "images": [],
    },
    {
        "slug": "coconut-ocean-glass",
        "category_slug": "aromatic",
        "material_slug": "coconut-wax",
        "scent_slug": "ocean-breeze",
        "shape_slug": "cylinder",
        "name_ru": "Кокосовая свеча Морской бриз",
        "name_en": "Coconut ocean breeze candle",
        "description_ru": "Свежий морской аромат в стеклянной банке. Кокосовый воск, деревянный фитиль.",
        "description_en": "Fresh ocean aroma in glass jar. Coconut wax, wooden wick.",
        "image_url": "https://images.unsplash.com/photo-1616486029423-aaa4789e8c9a?w=800",
        "variants": [
            {"sku": "CW-OCN-250", "size": "250 мл", "color": "Голубой", "shape": "Цилиндр",
             "pieces_per_box": 12, "price_per_piece_rub": 420, "price_per_piece_usd": 4.60, "stock_boxes": 15},
        ],
        "images": [
            {"url": "https://images.unsplash.com/photo-1616486029423-aaa4789e8c9a?w=800", "alt": "Морской бриз — стакан", "sort_order": 0},
            {"url": "https://images.unsplash.com/photo-1614110582498-537daf80a3e2?w=800", "alt": "Морской бриз — фитиль", "sort_order": 1},
        ],
    },
    {
        "slug": "outdoor-citronella-bucket",
        "category_slug": "outdoor",
        "material_slug": "soy-wax",
        "scent_slug": "citrus",
        "shape_slug": "cylinder",
        "name_ru": "Уличная свеча Цитронелла в ведёрке",
        "name_en": "Outdoor citronella bucket candle",
        "description_ru": "Отпугивает насекомых. Соевый воск с эфирным маслом цитронеллы. 20 часов горения.",
        "description_en": "Insect repellent. Soy wax with citronella essential oil. 20h burn time.",
        "image_url": "https://images.unsplash.com/photo-1594897030264-ab7d87efc473?w=800",
        "variants": [
            {"sku": "OUT-CIT-SM", "size": "Малое ведёрко", "color": "Серебро", "shape": "Цилиндр",
             "pieces_per_box": 12, "price_per_piece_rub": 260, "price_per_piece_usd": 2.85, "stock_boxes": 20},
            {"sku": "OUT-CIT-LG", "size": "Большое ведёрко", "color": "Серебро", "shape": "Цилиндр",
             "pieces_per_box": 6, "price_per_piece_rub": 450, "price_per_piece_usd": 4.95, "stock_boxes": 11},
        ],
        "images": [],
    },
    {
        "slug": "soy-cinnamon-tin",
        "category_slug": "aromatic",
        "material_slug": "soy-wax",
        "scent_slug": "cinnamon",
        "shape_slug": "cylinder",
        "name_ru": "Соевая свеча Корица в жестяной банке",
        "name_en": "Soy cinnamon tin candle",
        "description_ru": "Пряный согревающий аромат корицы. Компактная жестяная банка, удобно брать с собой.",
        "description_en": "Spicy warming cinnamon aroma. Compact tin, great for travel.",
        "image_url": "https://images.unsplash.com/photo-1603905179124-e8f5bb4d6522?w=800",
        "variants": [
            {"sku": "SOY-CIN-150", "size": "150 мл", "color": "Коричневый", "shape": "Цилиндр",
             "pieces_per_box": 24, "price_per_piece_rub": 195, "price_per_piece_usd": 2.15, "stock_boxes": 30},
        ],
        "images": [],
    },
    {
        "slug": "decorative-star-gold",
        "category_slug": "decorative",
        "material_slug": "paraffin",
        "scent_slug": "unscented",
        "shape_slug": "star",
        "name_ru": "Декоративная свеча-звезда Золото",
        "name_en": "Gold star decorative candle",
        "description_ru": "Праздничная декоративная свеча в форме звезды. Покрытие с золотым напылением.",
        "description_en": "Festive star-shaped decorative candle with gold coating.",
        "image_url": "https://images.unsplash.com/photo-1576010641433-95a1b0a7347b?w=800",
        "variants": [
            {"sku": "DC-STAR-GD-SM", "size": "Ø100 мм", "color": "Золотой", "shape": "Звезда",
             "pieces_per_box": 12, "price_per_piece_rub": 180, "price_per_piece_usd": 2.00, "stock_boxes": 14},
            {"sku": "DC-STAR-GD-LG", "size": "Ø150 мм", "color": "Золотой", "shape": "Звезда",
             "pieces_per_box": 6, "price_per_piece_rub": 310, "price_per_piece_usd": 3.40, "stock_boxes": 7},
            {"sku": "DC-STAR-SV-SM", "size": "Ø100 мм", "color": "Серебряный", "shape": "Звезда",
             "pieces_per_box": 12, "price_per_piece_rub": 180, "price_per_piece_usd": 2.00, "stock_boxes": 10},
        ],
        "images": [],
    },
    {
        "slug": "tea-light-soy-jasmine",
        "category_slug": "tea-lights",
        "material_slug": "soy-wax",
        "scent_slug": "jasmine",
        "shape_slug": "cylinder",
        "name_ru": "Чайная свеча соевая Жасмин",
        "name_en": "Soy jasmine tea light",
        "description_ru": "Ароматические чайные свечи из соевого воска. Нежный аромат жасмина.",
        "description_en": "Scented soy tea lights. Delicate jasmine aroma.",
        "image_url": "https://images.unsplash.com/photo-1581783898377-1c85bf937427?w=800",
        "variants": [
            {"sku": "TL-SOY-JAS-50", "size": "Ø38×16 мм", "color": "Кремовый", "shape": "Круглая",
             "pieces_per_box": 50, "price_per_piece_rub": 28, "price_per_piece_usd": 0.31, "stock_boxes": 35},
        ],
        "images": [],
    },
]


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

async def _seed_simple(model, data: list[dict], label: str) -> None:
    """Upsert rows for a simple slug-keyed table (materials, scents, shapes)."""
    if not data:
        return
    async with AsyncSessionLocal() as session:
        for row in data:
            await upsert(
                session,
                model,
                key={"slug": row["slug"]},
                values={"name_ru": row["name_ru"], "name_en": row["name_en"], "sort_order": row["sort_order"]},
            )
        await session.commit()
    print(f"[ok] {len(data)} {label}")


async def seed_attributes() -> None:
    await _seed_simple(Material, MATERIALS, "materials")
    await _seed_simple(Scent, SCENTS, "scents")
    await _seed_simple(Shape, SHAPES, "shapes")


async def seed_extra_categories() -> None:
    if not EXTRA_CATEGORIES:
        return
    async with AsyncSessionLocal() as session:
        for c in EXTRA_CATEGORIES:
            await upsert(
                session,
                Category,
                key={"slug": c["slug"]},
                values={"name_ru": c["name_ru"], "name_en": c["name_en"], "sort_order": c["sort_order"]},
            )
        await session.commit()
    print(f"[ok] {len(EXTRA_CATEGORIES)} extra categories")


async def seed_extra_products() -> None:
    async with AsyncSessionLocal() as session:
        cat_rows = await session.execute(select(Category.id, Category.slug))
        cat_by_slug = {slug: cid for cid, slug in cat_rows.all()}

        mat_rows = await session.execute(select(Material.id, Material.slug))
        mat_by_slug = {slug: mid for mid, slug in mat_rows.all()}

        scent_rows = await session.execute(select(Scent.id, Scent.slug))
        scent_by_slug = {slug: sid for sid, slug in scent_rows.all()}

        shape_rows = await session.execute(select(Shape.id, Shape.slug))
        shape_by_slug = {slug: shid for shid, slug in shape_rows.all()}

        img_count = 0

        for p in EXTRA_PRODUCTS:
            values = {
                "slug": p["slug"],
                "category_id": cat_by_slug.get(p.get("category_slug")),
                "material_id": mat_by_slug.get(p.get("material_slug")),
                "scent_id": scent_by_slug.get(p.get("scent_slug")),
                "shape_id": shape_by_slug.get(p.get("shape_slug")),
                "name_ru": p["name_ru"],
                "name_en": p["name_en"],
                "description_ru": p.get("description_ru"),
                "description_en": p.get("description_en"),
                "image_url": p.get("image_url"),
                "is_published": True,
            }
            product = await upsert(
                session,
                Product,
                key={"slug": values["slug"]},
                values={k: v for k, v in values.items() if k != "slug"},
            )
            product_id = product.id

            for v in p.get("variants", []):
                await upsert(
                    session,
                    ProductVariant,
                    key={"sku": v["sku"]},
                    values={k: val for k, val in v.items() if k != "sku"} | {"product_id": product_id},
                )

            for img in p.get("images", []):
                # No natural unique key on product_images; key on the (product, url)
                # pair so re-runs don't pile up duplicate gallery rows.
                await insert_if_absent(
                    session,
                    ProductImage,
                    key={"product_id": product_id, "url": img["url"]},
                    values={k: val for k, val in img.items() if k != "url"},
                )
                img_count += 1

        await session.commit()
    print(f"[ok] {len(EXTRA_PRODUCTS)} extra products + variants, {img_count} images")


# ---------------------------------------------------------------------------
# Also update existing products from bootstrap to have material/scent/shape refs
# ---------------------------------------------------------------------------

EXISTING_PRODUCT_REFS: list[dict] = [
    {"slug": "tea-light-classic", "material_slug": "paraffin", "scent_slug": "unscented", "shape_slug": "cylinder"},
    {"slug": "pillar-ivory-medium", "material_slug": "paraffin", "scent_slug": "unscented", "shape_slug": "cylinder"},
    {"slug": "taper-classic-25", "material_slug": "paraffin", "scent_slug": "unscented", "shape_slug": "cone"},
    {"slug": "decorative-rustic-ball", "material_slug": "paraffin", "scent_slug": "unscented", "shape_slug": "sphere"},
]


async def patch_existing_products() -> None:
    async with AsyncSessionLocal() as session:
        mat_rows = await session.execute(select(Material.id, Material.slug))
        mat_by_slug = {slug: mid for mid, slug in mat_rows.all()}
        scent_rows = await session.execute(select(Scent.id, Scent.slug))
        scent_by_slug = {slug: sid for sid, slug in scent_rows.all()}
        shape_rows = await session.execute(select(Shape.id, Shape.slug))
        shape_by_slug = {slug: shid for shid, slug in shape_rows.all()}

        updated = 0
        for ref in EXISTING_PRODUCT_REFS:
            product = await session.scalar(select(Product).where(Product.slug == ref["slug"]))
            if product is None:
                continue
            product.material_id = mat_by_slug.get(ref.get("material_slug"))
            product.scent_id = scent_by_slug.get(ref.get("scent_slug"))
            product.shape_id = shape_by_slug.get(ref.get("shape_slug"))
            updated += 1
        await session.commit()
    print(f"[ok] patched {updated} existing products with material/scent/shape refs")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    await seed_attributes()
    await seed_extra_categories()
    await seed_extra_products()
    await patch_existing_products()
    print()
    print("=== Mock data seeded successfully ===")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:  # noqa: BLE001
        print(f"[fatal] {exc}", file=sys.stderr)
        sys.exit(1)
