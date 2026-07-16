"""Add category home-page tile settings.

Revision ID: 0003_category_home_tiles
Revises: 0002_user_mfa
"""

import sqlalchemy as sa

from alembic import op

revision = "0003_category_home_tiles"
down_revision = "0002_user_mfa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("show_on_home", sa.Boolean(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column("categories", sa.Column("home_image_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("categories", "home_image_url")
    op.drop_column("categories", "show_on_home")
