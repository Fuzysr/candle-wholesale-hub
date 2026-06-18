"""Password reset tokens.

Отдельная таблица вместо JWT-claims — чтобы можно было:

* **Гарантировать одноразовость** — запись удаляется сразу после
  успешной смены пароля. У JWT такого свойства «из коробки» нет:
  его пришлось бы носить в чёрный список.
* **Жёстко контролировать TTL** — `created_at` проверяется
  запросом `WHERE created_at > NOW() - INTERVAL :ttl`, а не
  доверяется `exp`-клейму, подписанному тем же секретом, что и
  access-токены.
* **Не светить сам токен** — в базе хранится только SHA-256-хеш.
  Даже если дамп базы утечёт, действующие ссылки не компрометируются:
  токен у злоумышленника есть только в виде хеша, а входной поток
  `secrets.token_urlsafe(32)` делает прообраз вычислительно
  недостижимым.
"""
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.types import GUID, TZDateTime


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[UUID] = mapped_column(
        GUID(),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Почту дублируем, чтобы:
    # 1) не делать лишний JOIN в хот-пути `reset-confirm`;
    # 2) в аудит-логах было видно, на какой адрес уходила ссылка —
    #    даже если пользователь потом сменит email.
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    # Хранится SHA-256(raw_token).hex(). Длина всегда 64 символа.
    # Уникальный индекс: одного токена в базе быть не может,
    # а лукап по хешу — O(log n).
    token_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        TZDateTime, server_default=func.now(), nullable=False
    )
