"""Add volume_discounts table for per-variant volume pricing.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_volume_discounts"
down_revision = "0006_refresh_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "volume_discounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("min_boxes", sa.Integer(), nullable=False),
        sa.Column("discount_percent", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("variant_id", "min_boxes", name="uq_volume_discount_variant_min"),
    )
    op.create_index("ix_volume_discounts_variant_id", "volume_discounts", ["variant_id"])


def downgrade() -> None:
    op.drop_index("ix_volume_discounts_variant_id", table_name="volume_discounts")
    op.drop_table("volume_discounts")
