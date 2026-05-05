"""variant_images table — per-variant image gallery

Revision ID: 0008_variant_images
Revises: 0007_volume_discounts
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_variant_images"
down_revision = "0007_volume_discounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "variant_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("alt", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_variant_images_variant_id", "variant_images", ["variant_id"])


def downgrade() -> None:
    op.drop_index("ix_variant_images_variant_id", table_name="variant_images")
    op.drop_table("variant_images")
