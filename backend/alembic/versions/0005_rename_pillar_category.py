"""Rename the pillar category to cylinders.

Revision ID: 0005_rename_pillar_category
Revises: 0004_variant_catalog_filters
"""

from alembic import op

revision = "0005_rename_pillar_category"
down_revision = "0004_variant_catalog_filters"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE categories
        SET name_ru = 'Цилиндры', name_en = 'Cylinders'
        WHERE slug = 'pillar'
           OR name_ru IN ('Столбовые', 'Столбовые свечи')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE categories
        SET name_ru = 'Столбовые', name_en = 'Pillar'
        WHERE slug = 'pillar'
        """
    )
