"""Rebrand company_settings defaults and existing data to CANDWAX

Revision ID: 0011_rebrand_candwax
Revises: 0010_category_icon
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_rebrand_candwax"
down_revision = "0010_category_icon"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update column server_defaults so new DBs get the right name
    op.alter_column(
        "company_settings",
        "legal_name",
        server_default=sa.text("'ООО «CANDWAX»'"),
    )
    op.alter_column(
        "company_settings",
        "short_name",
        server_default=sa.text("'CANDWAX'"),
    )

    # 2. Update existing rows that still have the old placeholder values
    op.execute(
        "UPDATE company_settings "
        "SET legal_name = 'ООО «CANDWAX»' "
        "WHERE legal_name = 'ООО «Свечной двор»'"
    )
    op.execute(
        "UPDATE company_settings "
        "SET short_name = 'CANDWAX' "
        "WHERE short_name = 'Свечной двор'"
    )

    # 3. Update order number prefix WC- → CW-
    op.execute(
        "UPDATE orders SET order_number = 'CW-' || substring(order_number FROM 4) "
        "WHERE order_number LIKE 'WC-%'"
    )

    # 4. Update the trigger function to use new prefix
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.generate_order_number()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SET search_path = public
        AS $$
        BEGIN
          IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
            NEW.order_number := 'CW-' || nextval('public.order_number_seq');
          END IF;
          RETURN NEW;
        END;
        $$;
        """
    )


def downgrade() -> None:
    op.alter_column(
        "company_settings",
        "legal_name",
        server_default=sa.text("'ООО «Свечной двор»'"),
    )
    op.alter_column(
        "company_settings",
        "short_name",
        server_default=sa.text("'Свечной двор'"),
    )
    op.execute(
        "UPDATE company_settings "
        "SET legal_name = 'ООО «Свечной двор»' "
        "WHERE legal_name = 'ООО «CANDWAX»'"
    )
    op.execute(
        "UPDATE company_settings "
        "SET short_name = 'Свечной двор' "
        "WHERE short_name = 'CANDWAX'"
    )
    op.execute(
        "UPDATE orders SET order_number = 'WC-' || substring(order_number FROM 4) "
        "WHERE order_number LIKE 'CW-%'"
    )
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
