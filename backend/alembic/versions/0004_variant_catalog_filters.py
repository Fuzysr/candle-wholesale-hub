"""Add variant fields for catalog filters.

Revision ID: 0004_variant_catalog_filters
Revises: 0003_category_home_tiles
"""

import sqlalchemy as sa

from alembic import op

revision = "0004_variant_catalog_filters"
down_revision = "0003_category_home_tiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "product_variants",
        sa.Column("manufacturing_method", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "product_variants",
        sa.Column("has_scent", sa.Boolean(), server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("product_variants", "has_scent")
    op.drop_column("product_variants", "manufacturing_method")
