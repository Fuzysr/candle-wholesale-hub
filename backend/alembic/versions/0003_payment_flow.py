"""Add payment flow: new order statuses + payment_receipt_url column.

Revision ID: 0003_payment_flow
Revises: 0002_variant_image_url
Create Date: 2026-04-22
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_payment_flow"
down_revision: Union[str, Sequence[str], None] = "0002_variant_image_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new enum values to the existing order_status type.
    # PostgreSQL enums are ordered; we insert the new values in the
    # logical position between existing ones.
    op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_payment' AFTER 'processing';")
    op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'payment_review' AFTER 'awaiting_payment';")

    # New column to store the S3 URL of the payment receipt uploaded by the client.
    op.add_column("orders", sa.Column("payment_receipt_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "payment_receipt_url")
    # PostgreSQL does not support DROP VALUE from enums. A full migration
    # would need to create a new type, migrate the column, and drop the old
    # one. For a dev migration this is acceptable as-is.
