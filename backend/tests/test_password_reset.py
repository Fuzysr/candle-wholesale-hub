"""End-to-end tests for the email-based password reset flow.

Письмо в тестах не отправляется — `SMTP_HOST=""` в тестовой среде,
и роутер пишет raw-токен в warning-лог вместо того, чтобы открывать
SMTP-сессию. Поэтому позитивные сценарии `reset-confirm` мы
проверяем, создавая запись в `password_resets` напрямую через
ORM-сессию: это единственный безопасный способ получить сырой
токен без мока `secrets.token_urlsafe`.
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.password_reset import PasswordReset

pytestmark = pytest.mark.asyncio


def _sha256(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# reset-request
# ---------------------------------------------------------------------------


async def test_reset_request_for_unknown_email_returns_ok_and_creates_nothing(
    client, session
):
    """Ответ должен быть одинаковым, и запись в БД НЕ создаётся."""
    resp = await client.post(
        "/auth/password/reset-request",
        json={"email": "nobody@example.com"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    row = await session.scalar(select(PasswordReset))
    assert row is None


async def test_reset_request_for_known_email_stores_only_token_hash(
    client, client_user, session
):
    """Известный email → одна запись в password_resets, токен в виде SHA-256-хеша."""
    resp = await client.post(
        # email в верхнем регистре — проверяем, что lookup case-insensitive.
        "/auth/password/reset-request",
        json={"email": client_user.email.upper()},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    rows = (await session.execute(select(PasswordReset))).scalars().all()
    assert len(rows) == 1

    reset = rows[0]
    assert reset.user_id == client_user.id
    assert reset.email == client_user.email
    # 64 hex-символа = SHA-256. Парсим как hex, чтобы убедиться в формате.
    assert len(reset.token_hash) == 64
    int(reset.token_hash, 16)


async def test_reset_request_replaces_previously_issued_tokens(
    client, client_user, session
):
    """Второй запрос «Забыли пароль?» должен делать старую ссылку нерабочей."""
    # Сохраняем e-mail в локальной переменной ДО `expire_all`: иначе
    # просроченный ORM-инстанс попытается лениво подтянуть колонку
    # из БД sync-кодом и получит `MissingGreenlet`.
    user_email = client_user.email

    await client.post(
        "/auth/password/reset-request", json={"email": user_email}
    )
    first = (await session.execute(select(PasswordReset))).scalars().all()
    assert len(first) == 1
    first_hash = first[0].token_hash

    # Переоткрываем сессию — иначе вторая запись может не «увидеться»
    # из-за identity map. В тестах достаточно `expire_all`.
    session.expire_all()

    await client.post(
        "/auth/password/reset-request", json={"email": user_email}
    )
    second = (await session.execute(select(PasswordReset))).scalars().all()
    assert len(second) == 1
    assert second[0].token_hash != first_hash


# ---------------------------------------------------------------------------
# reset-confirm
# ---------------------------------------------------------------------------


async def test_reset_confirm_changes_password_and_deletes_token(
    client, client_user, session
):
    raw_token = "test-raw-token-xyz-123"
    session.add(
        PasswordReset(
            user_id=client_user.id,
            email=client_user.email,
            token_hash=_sha256(raw_token),
        )
    )
    await session.commit()

    resp = await client.post(
        "/auth/password/reset-confirm",
        json={"token": raw_token, "password": "new-very-strong"},
    )
    assert resp.status_code == 204

    # Старый пароль больше не пускает.
    old = await client.post(
        "/auth/login",
        json={"email": client_user.email, "password": "client-pw"},
    )
    assert old.status_code == 401

    # Новый пароль работает.
    new = await client.post(
        "/auth/login",
        json={"email": client_user.email, "password": "new-very-strong"},
    )
    assert new.status_code == 200

    # Одноразовость: запись удалена после успешной смены.
    session.expire_all()
    remaining = (await session.execute(select(PasswordReset))).scalars().all()
    assert remaining == []


async def test_reset_confirm_rejects_unknown_token(client):
    resp = await client.post(
        "/auth/password/reset-confirm",
        json={"token": "no-such-token-in-db", "password": "whatever-12"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid reset token"


async def test_reset_confirm_rejects_expired_token(client, client_user, session):
    raw_token = "expired-token-abc"
    reset = PasswordReset(
        user_id=client_user.id,
        email=client_user.email,
        token_hash=_sha256(raw_token),
    )
    session.add(reset)
    await session.commit()
    # Сдвигаем created_at в прошлое за TTL (по умолчанию 60 минут).
    reset.created_at = datetime.now(UTC) - timedelta(hours=2)
    await session.commit()

    resp = await client.post(
        "/auth/password/reset-confirm",
        json={"token": raw_token, "password": "new-very-strong"},
    )
    assert resp.status_code == 400

    # Протухший токен чистится сразу — таблица не копит «мусор».
    session.expire_all()
    remaining = (await session.execute(select(PasswordReset))).scalars().all()
    assert remaining == []


async def test_reset_confirm_is_single_use(client, client_user, session):
    """После первого успешного сброса тот же токен должен отдавать 400."""
    raw_token = "single-use-token"
    session.add(
        PasswordReset(
            user_id=client_user.id,
            email=client_user.email,
            token_hash=_sha256(raw_token),
        )
    )
    await session.commit()

    first = await client.post(
        "/auth/password/reset-confirm",
        json={"token": raw_token, "password": "first-password"},
    )
    assert first.status_code == 204

    second = await client.post(
        "/auth/password/reset-confirm",
        json={"token": raw_token, "password": "second-password"},
    )
    assert second.status_code == 400


async def test_reset_confirm_rejects_token_for_disabled_user(
    client, client_user, session
):
    raw_token = "disabled-user-token"
    session.add(
        PasswordReset(
            user_id=client_user.id,
            email=client_user.email,
            token_hash=_sha256(raw_token),
        )
    )
    # Блокируем пользователя — reset-confirm должен отказать.
    client_user.is_active = False
    await session.commit()

    resp = await client.post(
        "/auth/password/reset-confirm",
        json={"token": raw_token, "password": "new-very-strong"},
    )
    assert resp.status_code == 400

    # Запись подчистилась.
    session.expire_all()
    remaining = (await session.execute(select(PasswordReset))).scalars().all()
    assert remaining == []
