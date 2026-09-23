"""Bootstrap script: create/reset admin user and seed demo catalog data.

Run from the `backend/` directory:

    python -m scripts.bootstrap_admin

If `BOOTSTRAP_ADMIN_PASSWORD` is empty in `.env`, a random password is
generated and printed on stdout.
"""
from __future__ import annotations

import asyncio
import secrets
import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.catalog import Category, Product, ProductVariant
from app.models.enums import AppRole
from app.models.stock import DiscountTier
from app.models.user import User
from scripts._seed_utils import upsert

CATEGORIES = [
    {"slug": "tea-lights", "name_ru": "Чайные свечи", "name_en": "Tea lights", "sort_order": 10},
    {"slug": "pillar", "name_ru": "Цилиндры", "name_en": "Cylinder candles", "sort_order": 20},
    {"slug": "taper", "name_ru": "Столовые свечи", "name_en": "Taper candles", "sort_order": 30},
    {"slug": "decorative", "name_ru": "Декоративные", "name_en": "Decorative", "sort_order": 40},
]

PRODUCTS: list[dict] = [
    {
        "slug": "tea-light-classic",
        "category_slug": "tea-lights",
        "name_ru": "Чайная свеча классическая",
        "name_en": "Classic tea light",
        "description_ru": "Белая чайная свеча в алюминиевой гильзе, 4 часа горения.",
        "description_en": "White tea light in aluminium cup, 4h burn time.",
        "image_url": "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800",
        "variants": [
            {"sku": "TL-CL-W-50", "size": "Ø38×16 мм", "color": "Белый", "shape": "Круглая",
             "pieces_per_box": 100, "price_per_piece_rub": 14.5, "price_per_piece_usd": 0.16, "stock_boxes": 45},
            {"sku": "TL-CL-IV-50", "size": "Ø38×16 мм", "color": "Айвори", "shape": "Круглая",
             "pieces_per_box": 100, "price_per_piece_rub": 15.0, "price_per_piece_usd": 0.17, "stock_boxes": 30},
        ],
    },
    {
        "slug": "pillar-ivory-medium",
        "category_slug": "pillar",
        "name_ru": "Столбовая свеча Айвори",
        "name_en": "Ivory pillar candle",
        "description_ru": "Плотная столбовая свеча без запаха, 40 часов горения.",
        "description_en": "Unscented ivory pillar, 40h burn time.",
        "image_url": "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
        "variants": [
            {"sku": "PL-IV-70-150", "size": "Ø70×150 мм", "color": "Айвори", "shape": "Цилиндр",
             "pieces_per_box": 6, "price_per_piece_rub": 420, "price_per_piece_usd": 4.6, "stock_boxes": 18},
            {"sku": "PL-IV-70-200", "size": "Ø70×200 мм", "color": "Айвори", "shape": "Цилиндр",
             "pieces_per_box": 6, "price_per_piece_rub": 560, "price_per_piece_usd": 6.1, "stock_boxes": 12},
            {"sku": "PL-W-70-150", "size": "Ø70×150 мм", "color": "Белый", "shape": "Цилиндр",
             "pieces_per_box": 6, "price_per_piece_rub": 420, "price_per_piece_usd": 4.6, "stock_boxes": 4},
        ],
    },
    {
        "slug": "taper-classic-25",
        "category_slug": "taper",
        "name_ru": "Столовая свеча классическая 25 см",
        "name_en": "Classic taper 25 cm",
        "description_ru": "Элегантная столовая свеча, 8 часов горения.",
        "description_en": "Elegant taper, 8h burn time.",
        "image_url": "https://images.unsplash.com/photo-1608755728617-aefab37d2edd?w=800",
        "variants": [
            {"sku": "TP-W-25", "size": "25 см", "color": "Белый", "shape": "Конус",
             "pieces_per_box": 50, "price_per_piece_rub": 65, "price_per_piece_usd": 0.75, "stock_boxes": 22},
            {"sku": "TP-BK-25", "size": "25 см", "color": "Чёрный", "shape": "Конус",
             "pieces_per_box": 50, "price_per_piece_rub": 72, "price_per_piece_usd": 0.82, "stock_boxes": 8},
            {"sku": "TP-BR-25", "size": "25 см", "color": "Бордо", "shape": "Конус",
             "pieces_per_box": 50, "price_per_piece_rub": 72, "price_per_piece_usd": 0.82, "stock_boxes": 15},
        ],
    },
    {
        "slug": "decorative-rustic-ball",
        "category_slug": "decorative",
        "name_ru": "Декоративная свеча-шар Rustic",
        "name_en": "Rustic ball candle",
        "description_ru": "Декоративная свеча-шар с фактурной поверхностью.",
        "description_en": "Decorative ball candle with rustic texture.",
        "image_url": "https://images.unsplash.com/photo-1601181054013-b1c10b4afa74?w=800",
        "variants": [
            {"sku": "DC-BL-8", "size": "Ø80 мм", "color": "Серый", "shape": "Шар",
             "pieces_per_box": 12, "price_per_piece_rub": 290, "price_per_piece_usd": 3.2, "stock_boxes": 9},
            {"sku": "DC-BL-10", "size": "Ø100 мм", "color": "Серый", "shape": "Шар",
             "pieces_per_box": 8, "price_per_piece_rub": 380, "price_per_piece_usd": 4.2, "stock_boxes": 5},
        ],
    },
]

DISCOUNT_TIERS = [
    {"min_boxes": 5, "discount_percent": 3},
    {"min_boxes": 20, "discount_percent": 7},
    {"min_boxes": 50, "discount_percent": 12},
    {"min_boxes": 100, "discount_percent": 18},
]


async def ensure_admin() -> tuple[str, str, str]:
    """Create or re-password the admin user. Returns (user_id, email, password)."""
    password = settings.bootstrap_admin_password or f"admin-{secrets.token_hex(6)}"
    async with AsyncSessionLocal() as session:
        user = await session.scalar(
            select(User).where(User.email == settings.bootstrap_admin_email.lower())
        )
        if user is None:
            user = User(
                email=settings.bootstrap_admin_email.lower(),
                password_hash=hash_password(password),
                role=AppRole.admin,
                company_name="CANDWAX",
                contact_name="Admin",
                phone="+7 000 000-00-00",
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            created = True
        else:
            user.password_hash = hash_password(password)
            user.role = AppRole.admin
            await session.commit()
            await session.refresh(user)
            created = False
        print(f"[ok] admin user {'created' if created else 'updated'} ({user.id})")
        return str(user.id), user.email, password


async def seed_categories() -> None:
    async with AsyncSessionLocal() as session:
        for c in CATEGORIES:
            await upsert(
                session,
                Category,
                key={"slug": c["slug"]},
                values={"name_ru": c["name_ru"], "name_en": c["name_en"], "sort_order": c["sort_order"]},
            )
        await session.commit()
    print(f"[ok] {len(CATEGORIES)} categories")


async def seed_products() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Category.id, Category.slug))
        cat_by_slug = {slug: cid for cid, slug in result.all()}

        for p in PRODUCTS:
            product = await upsert(
                session,
                Product,
                key={"slug": p["slug"]},
                values={
                    "category_id": cat_by_slug.get(p["category_slug"]),
                    "name_ru": p["name_ru"],
                    "name_en": p["name_en"],
                    "description_ru": p.get("description_ru"),
                    "description_en": p.get("description_en"),
                    "image_url": p.get("image_url"),
                    "is_published": True,
                },
            )

            for v in p["variants"]:
                await upsert(
                    session,
                    ProductVariant,
                    key={"sku": v["sku"]},
                    values={k: val for k, val in v.items() if k != "sku"} | {"product_id": product.id},
                )
        await session.commit()
    print(f"[ok] {len(PRODUCTS)} products + variants")


async def seed_discount_tiers() -> None:
    async with AsyncSessionLocal() as session:
        for tier in DISCOUNT_TIERS:
            await upsert(
                session,
                DiscountTier,
                key={"min_boxes": tier["min_boxes"]},
                values={"discount_percent": tier["discount_percent"]},
            )
        await session.commit()
    print(f"[ok] {len(DISCOUNT_TIERS)} discount tiers")


async def main() -> None:
    user_id, email, password = await ensure_admin()

    banner = "=" * 60
    print()
    print(banner)
    print(" ADMIN CREDENTIALS")
    print(banner)
    print(f" Email:     {email}")
    print(f" Password:  {password}")
    print(f" User ID:   {user_id}")
    print(" Login at:  http://localhost:5173/auth  (mode: Вход)")
    print(banner)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:  # noqa: BLE001
        print(f"[fatal] {exc}", file=sys.stderr)
        sys.exit(1)
