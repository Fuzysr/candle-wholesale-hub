"""Add icon column to categories

Revision ID: 0010_category_icon
Revises: 0009_variant_dimensions
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_category_icon"
down_revision = "0009_variant_dimensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("icon", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("categories", "icon")
