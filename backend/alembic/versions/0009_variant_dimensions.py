"""Add physical dimensions, weight, burn time and box specs to product_variants

Revision ID: 0009_variant_dimensions
Revises: 0008_variant_images
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_variant_dimensions"
down_revision = "0008_variant_images"
branch_labels = None
depends_on = None

_TABLE = "product_variants"

_COLUMNS = [
    # Item dimensions (mm)
    ("length_mm", sa.Integer(), True),
    ("width_mm", sa.Integer(), True),
    ("height_mm", sa.Integer(), True),
    # Physical specs
    ("weight_gr", sa.Integer(), True),
    ("burn_time_hours", sa.Integer(), True),
    # Transport box (TK)
    ("packages_per_box", sa.Integer(), True),
    ("box_length_mm", sa.Integer(), True),
    ("box_width_mm", sa.Integer(), True),
    ("box_height_mm", sa.Integer(), True),
    ("box_weight_gr", sa.Integer(), True),
]


def upgrade() -> None:
    for name, type_, nullable in _COLUMNS:
        op.add_column(_TABLE, sa.Column(name, type_, nullable=nullable))


def downgrade() -> None:
    for name, _, _ in reversed(_COLUMNS):
        op.drop_column(_TABLE, name)
