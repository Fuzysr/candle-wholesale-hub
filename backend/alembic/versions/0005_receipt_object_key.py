"""Add orders.payment_receipt_key for the private-bucket receipt flow.

Background
----------
The receipt bucket used to be world-readable; rows therefore stored the
**public** URL straight in `orders.payment_receipt_url`. Anyone who got
hold of (or guessed) such a URL could download the buyer's payment
proof — a PII / fraud risk. We now keep receipts in a private bucket
and serve them only via short-lived presigned URLs.

This migration:

1. adds a nullable `orders.payment_receipt_key` column;
2. back-fills it for existing rows by stripping the public URL prefix
   (`{base}/{bucket}/`) — best-effort, leaves the column NULL when the
   URL doesn't match the expected pattern;
3. keeps `payment_receipt_url` for legacy rows so old receipts remain
   recognisable in audit history; new uploads must populate
   `payment_receipt_key` only.

Revision ID: 0005_receipt_object_key
Revises: 0004_password_resets
Create Date: 2026-04-25
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_receipt_object_key"
down_revision: Union[str, Sequence[str], None] = "0004_password_resets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("payment_receipt_key", sa.Text(), nullable=True),
    )

    # Best-effort back-fill: pull the part of the legacy public URL that
    # comes after `/<receipts-bucket>/`. We cannot reach `settings.s3_*`
    # from a migration (configuration is environment-dependent), so we
    # match the path component generically: everything after the LAST
    # `/payment-receipts/` segment becomes the key.
    op.execute(
        """
        UPDATE orders
        SET payment_receipt_key = regexp_replace(
            payment_receipt_url,
            '^.*/payment-receipts/',
            ''
        )
        WHERE payment_receipt_url IS NOT NULL
          AND payment_receipt_url LIKE '%/payment-receipts/%'
          AND payment_receipt_key IS NULL;
        """
    )


def downgrade() -> None:
    op.drop_column("orders", "payment_receipt_key")
