"""initial schema

Ports the Supabase schema to a stand-alone Postgres DB:

* drops Supabase-specific bits (RLS, auth.users, storage buckets, has_role(),
  handle_new_user(), user_roles)
* merges `auth.users` + `profiles` + `user_roles` into a single `users` table
* keeps the useful DB-side helpers: `update_updated_at_column()`, order number
  sequence + trigger
* seeds the attribute lookups (materials/scents/shapes) and the
  `company_settings` singleton row

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-17
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


APP_ROLE_VALUES = ("admin", "client")
ORDER_STATUS_VALUES = (
    "new",
    "processing",
    "invoiced",
    "paid",
    "shipped",
    "completed",
    "cancelled",
)
STOCK_MOVEMENT_TYPE_VALUES = ("in", "out", "reserve", "release", "adjust", "sync")

# Enum type objects are defined at module scope and reused in every column
# below. `create_type=False` tells SQLAlchemy not to auto-emit `CREATE TYPE`
# from `create_table` — we create them explicitly once at the top of
# `upgrade()` with `checkfirst=True`. If you pass `sa.Enum(..., name="x")`
# per column instead of a shared object, SQLAlchemy loses track of the
# «already created» state and the migration blows up with
# `DuplicateObject: type "x" already exists` on the second column.
APP_ROLE_ENUM = postgresql.ENUM(*APP_ROLE_VALUES, name="app_role", create_type=False)
ORDER_STATUS_ENUM = postgresql.ENUM(*ORDER_STATUS_VALUES, name="order_status", create_type=False)
STOCK_MOVEMENT_TYPE_ENUM = postgresql.ENUM(
    *STOCK_MOVEMENT_TYPE_VALUES, name="stock_movement_type", create_type=False
)


def upgrade() -> None:
    # ---------------------------------------------------------------
    # Shared helpers
    # ---------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.update_updated_at_column()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SET search_path = public
        AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$;
        """
    )

    # ---------------------------------------------------------------
    # Enum types — create once, reuse the module-level objects everywhere.
    # ---------------------------------------------------------------
    APP_ROLE_ENUM.create(op.get_bind(), checkfirst=True)
    ORDER_STATUS_ENUM.create(op.get_bind(), checkfirst=True)
    STOCK_MOVEMENT_TYPE_ENUM.create(op.get_bind(), checkfirst=True)

    # ---------------------------------------------------------------
    # users
    # ---------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column(
            "role",
            APP_ROLE_ENUM,
            nullable=False,
            server_default=sa.text("'client'"),
        ),
        sa.Column("company_name", sa.String(), nullable=True),
        sa.Column("contact_name", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("inn", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # Note: `email` is already unique (and therefore indexed) via `unique=True`.
    op.execute(
        """
        CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON public.users
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
        """
    )

    # ---------------------------------------------------------------
    # categories (self-referential)
    # ---------------------------------------------------------------
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("slug", sa.String(), nullable=False, unique=True),
        sa.Column("name_ru", sa.String(), nullable=False),
        sa.Column("name_en", sa.String(), nullable=False),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.execute(
        """
        CREATE TRIGGER trg_categories_updated_at
        BEFORE UPDATE ON public.categories
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
        """
    )

    # ---------------------------------------------------------------
    # Attribute lookups: materials / scents / shapes (identical shape)
    # ---------------------------------------------------------------
    for table in ("materials", "scents", "shapes"):
        op.create_table(
            table,
            sa.Column(
                "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
            ),
            sa.Column("slug", sa.String(), nullable=False, unique=True),
            sa.Column("name_ru", sa.String(), nullable=False),
            sa.Column("name_en", sa.String(), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    # ---------------------------------------------------------------
    # products
    # ---------------------------------------------------------------
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("slug", sa.String(), nullable=False, unique=True),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "material_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("materials.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "scent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "shape_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shapes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name_ru", sa.String(), nullable=False),
        sa.Column("name_en", sa.String(), nullable=False),
        sa.Column("description_ru", sa.Text(), nullable=True),
        sa.Column("description_en", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_material_id", "products", ["material_id"])
    op.create_index("ix_products_scent_id", "products", ["scent_id"])
    op.create_index("ix_products_shape_id", "products", ["shape_id"])
    op.execute(
        """
        CREATE TRIGGER trg_products_updated_at
        BEFORE UPDATE ON public.products
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
        """
    )

    # ---------------------------------------------------------------
    # product_variants
    # ---------------------------------------------------------------
    op.create_table(
        "product_variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sku", sa.String(), nullable=False, unique=True),
        sa.Column("size", sa.String(), nullable=True),
        sa.Column("color", sa.String(), nullable=True),
        sa.Column("shape", sa.String(), nullable=True),
        sa.Column("pieces_per_box", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("price_per_piece_rub", sa.Numeric(10, 2), nullable=False),
        sa.Column("price_per_piece_usd", sa.Numeric(10, 2), nullable=False),
        sa.Column("stock_boxes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("reserved_boxes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("external_id", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])
    # `sku` already has a unique index via `unique=True`.
    op.execute(
        """
        CREATE TRIGGER trg_product_variants_updated_at
        BEFORE UPDATE ON public.product_variants
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
        """
    )

    # ---------------------------------------------------------------
    # product_images
    # ---------------------------------------------------------------
    op.create_table(
        "product_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("alt", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_product_images_product_id", "product_images", ["product_id", "sort_order"])

    # ---------------------------------------------------------------
    # discount_tiers
    # ---------------------------------------------------------------
    op.create_table(
        "discount_tiers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("min_boxes", sa.Integer(), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("min_boxes", name="uq_discount_tiers_min_boxes"),
    )

    # ---------------------------------------------------------------
    # orders
    # ---------------------------------------------------------------
    op.execute("CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 10000;")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.generate_order_number()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SET search_path = public
        AS $$
        BEGIN
          IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
            NEW.order_number := 'WC-' || nextval('public.order_number_seq');
          END IF;
          RETURN NEW;
        END;
        $$;
        """
    )

    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_number", sa.String(), nullable=False, unique=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            ORDER_STATUS_ENUM,
            nullable=False,
            server_default=sa.text("'new'"),
        ),
        sa.Column("currency", sa.String(), nullable=False, server_default=sa.text("'RUB'")),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("discount_amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("total_boxes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("delivery_address", sa.Text(), nullable=True),
        sa.Column("delivery_date", sa.Date(), nullable=True),
        sa.Column("customer_comment", sa.Text(), nullable=True),
        sa.Column("admin_comment", sa.Text(), nullable=True),
        sa.Column("company_name", sa.String(), nullable=True),
        sa.Column("contact_name", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("inn", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_orders_user_id", "orders", ["user_id"])
    op.create_index("ix_orders_status", "orders", ["status"])
    op.execute(
        """
        CREATE TRIGGER trg_orders_updated_at
        BEFORE UPDATE ON public.orders
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_order_number
        BEFORE INSERT ON public.orders
        FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();
        """
    )

    # ---------------------------------------------------------------
    # order_items
    # ---------------------------------------------------------------
    op.create_table(
        "order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("product_variants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("sku", sa.String(), nullable=False),
        sa.Column("product_name", sa.String(), nullable=False),
        sa.Column("variant_label", sa.String(), nullable=True),
        sa.Column("pieces_per_box", sa.Integer(), nullable=False),
        sa.Column("boxes", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])

    # ---------------------------------------------------------------
    # order_status_history
    # ---------------------------------------------------------------
    op.create_table(
        "order_status_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            ORDER_STATUS_ENUM,
            nullable=False,
        ),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "changed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_order_status_history_order_id", "order_status_history", ["order_id"])

    # ---------------------------------------------------------------
    # stock_movements
    # ---------------------------------------------------------------
    op.create_table(
        "stock_movements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("product_variants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "type",
            STOCK_MOVEMENT_TYPE_ENUM,
            nullable=False,
        ),
        sa.Column("qty_boxes", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("ref_id", sa.String(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_stock_movements_variant_id_created_at",
        "stock_movements",
        ["variant_id", sa.text("created_at DESC")],
    )

    # ---------------------------------------------------------------
    # company_settings (singleton)
    # ---------------------------------------------------------------
    op.create_table(
        "company_settings",
        sa.Column("id", sa.Integer(), primary_key=True, server_default=sa.text("1")),
        sa.Column("legal_name", sa.Text(), nullable=False, server_default=sa.text("'ООО «Свечной двор»'")),
        sa.Column("short_name", sa.Text(), nullable=False, server_default=sa.text("'Свечной двор'")),
        sa.Column("inn", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("kpp", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("ogrn", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("legal_address", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("postal_address", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("bank_name", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("bank_bik", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("bank_account", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("corr_account", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("director_name", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column(
            "director_position",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'Генеральный директор'"),
        ),
        sa.Column("phone", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("email", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column(
            "offer_text",
            sa.Text(),
            nullable=False,
            server_default=sa.text(
                "'Настоящий счёт-договор является публичной офертой. "
                "Оплата счёта означает согласие с условиями поставки.'"
            ),
        ),
        sa.Column(
            "payment_terms",
            sa.Text(),
            nullable=False,
            server_default=sa.text(
                "'Оплата по безналичному расчёту в течение 3 банковских дней с момента выставления счёта.'"
            ),
        ),
        sa.Column(
            "delivery_terms",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'Отгрузка со склада в Москве. Доставка по согласованию.'"),
        ),
        sa.Column("signature_url", sa.Text(), nullable=True),
        sa.Column("stamp_url", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="singleton"),
    )
    op.execute("INSERT INTO public.company_settings (id) VALUES (1) ON CONFLICT DO NOTHING;")
    op.execute(
        """
        CREATE TRIGGER trg_company_settings_updated_at
        BEFORE UPDATE ON public.company_settings
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
        """
    )

    # ---------------------------------------------------------------
    # Seed attribute lookups
    # ---------------------------------------------------------------
    op.execute(
        """
        INSERT INTO public.materials (slug, name_ru, name_en, sort_order) VALUES
          ('paraffin', 'Парафин',        'Paraffin',    1),
          ('soy',      'Соевый воск',    'Soy wax',     2),
          ('beeswax',  'Пчелиный воск',  'Beeswax',     3),
          ('palm',     'Пальмовый воск', 'Palm wax',    4),
          ('coconut',  'Кокосовый воск', 'Coconut wax', 5)
        ON CONFLICT (slug) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO public.scents (slug, name_ru, name_en, sort_order) VALUES
          ('unscented',  'Без аромата', 'Unscented',  1),
          ('vanilla',    'Ваниль',      'Vanilla',    2),
          ('lavender',   'Лаванда',     'Lavender',   3),
          ('sandalwood', 'Сандал',      'Sandalwood', 4),
          ('citrus',     'Цитрус',      'Citrus',     5),
          ('coffee',     'Кофе',        'Coffee',     6),
          ('cinnamon',   'Корица',      'Cinnamon',   7)
        ON CONFLICT (slug) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO public.shapes (slug, name_ru, name_en, sort_order) VALUES
          ('pillar',    'Колонна',    'Pillar',    1),
          ('taper',     'Конусная',   'Taper',     2),
          ('tealight',  'Чайная',     'Tealight',  3),
          ('container', 'В стакане',  'Container', 4),
          ('votive',    'Вотивная',   'Votive',    5),
          ('floating',  'Плавающая',  'Floating',  6),
          ('figure',    'Фигурная',   'Figure',    7)
        ON CONFLICT (slug) DO NOTHING;
        """
    )


def downgrade() -> None:
    # Drop in reverse dependency order, then enums, then helpers
    op.execute("DROP TRIGGER IF EXISTS trg_company_settings_updated_at ON public.company_settings;")
    op.drop_table("company_settings")

    op.drop_index("ix_stock_movements_variant_id_created_at", table_name="stock_movements")
    op.drop_table("stock_movements")

    op.drop_index("ix_order_status_history_order_id", table_name="order_status_history")
    op.drop_table("order_status_history")

    op.drop_index("ix_order_items_order_id", table_name="order_items")
    op.drop_table("order_items")

    op.execute("DROP TRIGGER IF EXISTS trg_order_number ON public.orders;")
    op.execute("DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;")
    op.drop_index("ix_orders_status", table_name="orders")
    op.drop_index("ix_orders_user_id", table_name="orders")
    op.drop_table("orders")
    op.execute("DROP FUNCTION IF EXISTS public.generate_order_number();")
    op.execute("DROP SEQUENCE IF EXISTS public.order_number_seq;")

    op.drop_table("discount_tiers")

    op.drop_index("ix_product_images_product_id", table_name="product_images")
    op.drop_table("product_images")

    op.execute("DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON public.product_variants;")
    op.drop_index("ix_product_variants_product_id", table_name="product_variants")
    op.drop_table("product_variants")

    op.execute("DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;")
    op.drop_index("ix_products_shape_id", table_name="products")
    op.drop_index("ix_products_scent_id", table_name="products")
    op.drop_index("ix_products_material_id", table_name="products")
    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_table("products")

    op.drop_table("shapes")
    op.drop_table("scents")
    op.drop_table("materials")

    op.execute("DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;")
    op.drop_table("categories")

    op.execute("DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;")
    op.drop_table("users")

    # Enums and shared helpers last
    postgresql.ENUM(name="stock_movement_type").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="order_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="app_role").drop(op.get_bind(), checkfirst=True)

    op.execute("DROP FUNCTION IF EXISTS public.update_updated_at_column();")
