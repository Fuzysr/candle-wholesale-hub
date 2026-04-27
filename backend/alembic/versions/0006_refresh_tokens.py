"""Add refresh_tokens registry for revocation, rotation and reuse-detection.

Background
----------
До этой миграции ``/auth/refresh`` доверял исключительно подписи JWT
и его ``exp``. Это означало:

* пользователя нельзя было «выкинуть» — refresh жил до своего ``exp``
  даже после ``logout`` или ``is_active = false``;
* украденный refresh нельзя было детектировать: и зловред, и легитимный
  клиент крутили один и тот же токен и оба получали свежие access'ы.

Эта миграция вводит таблицу-реестр выпущенных refresh-токенов. Сами
JWT остаются — мы не превращаем их во внутренние session-id; просто
требуем, чтобы JWT-jti находился в реестре в активном состоянии.

Поведение приложения после миграции:

* На login создаётся запись (``revoked_at IS NULL``, ``family_id`` =
  новый uuid).
* На каждом успешном ``/refresh`` старая запись помечается revoked,
  новая создаётся с тем же ``family_id`` и ``parent_jti = old.jti``,
  а в ``old.replaced_by_jti`` пишется новый jti.
* Попытка refresh-а уже-ротированного токена (``revoked_at IS NOT
  NULL`` AND ``replaced_by_jti IS NOT NULL``) → reuse: отзываем всю
  family и возвращаем 401.
* ``/auth/logout`` ставит ``revoked_at`` для предъявленного refresh.

Revision ID: 0006_refresh_tokens
Revises: 0005_receipt_object_key
Create Date: 2026-04-25
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_refresh_tokens"
down_revision: Union[str, Sequence[str], None] = "0005_receipt_object_key"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("jti", sa.String(length=32), primary_key=True),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "family_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("parent_jti", sa.String(length=32), nullable=True),
        sa.Column("replaced_by_jti", sa.String(length=32), nullable=True),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
    )

    # Лукап на refresh: WHERE jti = ? — это и есть PK, индекс уже есть.
    # Доп. индексы:
    op.create_index(
        "ix_refresh_tokens_user_id",
        "refresh_tokens",
        ["user_id"],
    )
    # По family_id мы делаем массовый UPDATE при reuse-detection
    # ("revoke whole family") и при logout-all.
    op.create_index(
        "ix_refresh_tokens_family_id",
        "refresh_tokens",
        ["family_id"],
    )
    # Для будущего cleanup-таска: «удали всё с expires_at < now()
    # AND revoked_at < now() - 30 дней».
    op.create_index(
        "ix_refresh_tokens_expires_at",
        "refresh_tokens",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
