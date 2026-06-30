"""Add encrypted TOTP MFA fields.

Revision ID: 0002_user_mfa
Revises: 0001_mysql_baseline
"""

import sqlalchemy as sa

from alembic import op

revision = "0002_user_mfa"
down_revision = "0001_mysql_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.text("0"), nullable=False))
    op.add_column("users", sa.Column("mfa_secret_encrypted", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "mfa_secret_encrypted")
    op.drop_column("users", "mfa_enabled")
