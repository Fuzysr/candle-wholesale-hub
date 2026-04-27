"""Refresh token registry for revocation, rotation and reuse-detection.

Зачем отдельная таблица, если refresh — это JWT?

Чистый JWT-only refresh-flow ломается на трёх типичных задачах:

* **Revocation на logout / disable user.** JWT валиден до своего ``exp``;
  без чёрного списка отозвать его невозможно.
* **Rotation с детекцией reuse.** Best-practice (OAuth2 BCP, RFC 9700)
  предписывает ротировать refresh-token при каждом обмене. Если
  зловред сумел украсть refresh, легитимный клиент рано или поздно
  предъявит уже-использованный токен — и это сигнал «утечка»: надо
  отозвать всю семью, выкинув из системы и зловреда, и легитимного
  пользователя, который перезайдёт. Для этого нужно состояние.
* **Аудит сессий.** «Сколько активных сессий, с каких IP, когда
  последний refresh» — без таблицы не ответить.

Что мы храним:

* **jti** — primary key, он же идентификатор записи. Сам JWT
  по-прежнему подписан и проверяется подписью; jti берём из claim
  и используем как лукап-ключ. ``uuid4().hex`` даёт 128 бит
  энтропии, перебор лукапа нереален.
* **family_id** — все токены, восходящие к одному login-у, делят
  один family_id. Reuse-detection отзывает family целиком.
* **parent_jti / replaced_by_jti** — двусторонние ссылки на
  цепочку ротаций. Нужны для аудита и detection.
* **revoked_at** — момент отзыва (logout, reuse, ротация). NULL,
  пока токен ещё активен.
* **expires_at** — копия ``exp`` из JWT. По нему делается cleanup
  старых записей, не привязываясь к парсингу JWT.
* **user_agent / ip** — best-effort аудит-инфо. Никаких security-
  решений на их основе **не** принимаем (легко подделываются).
"""
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    # jti из JWT-payload. Совпадает с claim "jti", по нему ищем
    # запись на /refresh. Длина 32 hex-символа (uuid4().hex).
    jti: Mapped[str] = mapped_column(String(32), primary_key=True)

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Все токены, выпущенные в одной login-сессии (login + последующие
    # rotation-обмены), делят один family_id. При обнаружении reuse
    # отзывается вся family — это и есть смысл этой колонки.
    family_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), nullable=False, index=True
    )

    # Цепочка ротаций. На login parent_jti=NULL; на каждом /refresh
    # новая запись получает parent_jti=<старый jti>, а старая —
    # replaced_by_jti=<новый jti>. Reuse — это попытка использовать
    # запись, у которой replaced_by_jti уже не NULL.
    parent_jti: Mapped[str | None] = mapped_column(String(32), nullable=True)
    replaced_by_jti: Mapped[str | None] = mapped_column(String(32), nullable=True)

    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Best-effort аудит. NOT used for any auth decision.
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
