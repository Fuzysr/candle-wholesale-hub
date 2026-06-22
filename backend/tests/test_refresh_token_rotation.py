"""HIGH #1 — refresh-token revocation, rotation и reuse-detection.

Эти тесты — инвариант, который гарантирует:

1. **rotation:** каждый успешный ``/refresh`` возвращает НОВУЮ пару
   ``access`` + ``refresh``; старый refresh после этого больше не
   принимается.
2. **revocation:** после ``/logout`` тот же refresh даёт 401, а если
   пароль был сброшен — все ранее выданные refresh-ы пользователя
   должны стать невалидны.
3. **reuse-detection:** если злоумышленник украл refresh и предъявил
   его уже после того, как легитимный клиент его проротировал — мы
   не просто отказываем, мы отзываем ВСЮ семью (= и злоумышленника,
   и легитимного клиента), потому что теперь нельзя сказать, кто из
   них настоящий.
4. **registry-integrity:** unknown jti, jti-mismatch с user_id и
   таймскью между jwt-exp и БД-exp — все 401.

Каждый тест предельно сосредоточен на одном инварианте — это
страхует код от регрессий точечно.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.security import create_refresh_token, mint_refresh_token
from app.models.refresh_token import RefreshToken

pytestmark = pytest.mark.asyncio(loop_scope="session")

_requires_row_locks = pytest.mark.skipif(
    make_url(settings.database_url).get_backend_name() == "sqlite",
    reason="SQLite ignores SELECT FOR UPDATE; concurrency invariant requires MySQL",
)


async def _register(client, email: str = "rot@example.com") -> dict:
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "Rotation-pw-123"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    data["access"] = resp.cookies.get("cwh_access")
    data["refresh"] = resp.cookies.get("cwh_refresh")
    assert data["access"] and data["refresh"]
    return data


# ---------------------------------------------------------------------------
# 1. Rotation — каждый refresh выдаёт новый refresh-токен.
# ---------------------------------------------------------------------------


async def test_refresh_rotates_token_old_no_longer_works(client):
    """После refresh старый токен инвалидируется (single-use)."""
    creds = await _register(client)
    old_refresh = creds["refresh"]

    first = await client.post("/auth/refresh", json={"refresh": old_refresh})
    assert first.status_code == 200, first.text
    new_refresh = first.cookies.get("cwh_refresh")
    assert new_refresh, "/refresh должен вернуть новый refresh-токен"
    assert new_refresh != old_refresh, "rotation обязан выдавать новый токен"

    # Старый refresh теперь не валиден.
    replay = await client.post("/auth/refresh", json={"refresh": old_refresh})
    assert replay.status_code == 401


async def test_immediate_refresh_retry_does_not_revoke_rotated_token(client):
    """Технический дубль отклоняется, но победивший refresh остаётся рабочим."""
    creds = await _register(client, email="rotation-retry@example.com")
    old_refresh = creds["refresh"]

    rotated = await client.post("/auth/refresh", json={"refresh": old_refresh})
    assert rotated.status_code == 200, rotated.text

    retry = await client.post("/auth/refresh", json={"refresh": old_refresh})
    assert retry.status_code == 401
    assert retry.json()["detail"] == "refresh already used"

    rotated_refresh = rotated.cookies.get("cwh_refresh")
    assert rotated_refresh
    winner = await client.post("/auth/refresh", json={"refresh": rotated_refresh})
    assert winner.status_code == 200, winner.text


@_requires_row_locks
async def test_concurrent_refresh_creates_exactly_one_child(client, session):
    """Два одновременных запроса не могут разветвить refresh-цепочку."""
    creds = await _register(client, email="rotation-race@example.com")
    old_refresh = creds["refresh"]

    first, second = await asyncio.gather(
        client.post("/auth/refresh", json={"refresh": old_refresh}),
        client.post("/auth/refresh", json={"refresh": old_refresh}),
    )

    assert sorted((first.status_code, second.status_code)) == [200, 401]
    winner = first if first.status_code == 200 else second
    winner_jti = jwt.decode(
        winner.cookies.get("cwh_refresh"),
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )["jti"]

    rows = (await session.execute(select(RefreshToken))).scalars().all()
    assert len(rows) == 2
    active = [row for row in rows if row.revoked_at is None]
    assert [row.jti for row in active] == [winner_jti]


async def test_refresh_chain_works_repeatedly(client):
    """Цепочка из нескольких rotation-ов корректно идёт по семье."""
    creds = await _register(client, email="chain@example.com")
    current = creds["refresh"]

    seen = {current}
    for _ in range(3):
        resp = await client.post("/auth/refresh", json={"refresh": current})
        assert resp.status_code == 200, resp.text
        current = resp.cookies.get("cwh_refresh")
        assert current
        assert current not in seen, "rotation должен выдавать уникальные токены"
        seen.add(current)


async def test_refresh_response_includes_access_and_refresh(client):
    """После rotation в ответе есть и access, и refresh."""
    creds = await _register(client, email="pair@example.com")

    resp = await client.post("/auth/refresh", json={"refresh": creds["refresh"]})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert resp.cookies.get("cwh_access")
    assert resp.cookies.get("cwh_refresh")


# ---------------------------------------------------------------------------
# 2. Reuse-detection — повторное предъявление ротированного токена.
# ---------------------------------------------------------------------------


async def test_refresh_reuse_revokes_entire_family(client, session):
    """Replay старого токена после rotation = вся семья отзывается."""
    creds = await _register(client, email="reuse@example.com")
    first_refresh = creds["refresh"]

    # Легитимный клиент рутинно делает refresh.
    rotated = await client.post("/auth/refresh", json={"refresh": first_refresh})
    assert rotated.status_code == 200
    second_refresh = rotated.cookies.get("cwh_refresh")
    assert second_refresh

    # Replay за пределами grace-окна — уже не сетевой дубль, а сигнал
    # компрометации. Сдвигаем время вместо реального sleep.
    first_jti = jwt.decode(
        first_refresh,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )["jti"]
    first_record = await session.scalar(select(RefreshToken).where(RefreshToken.jti == first_jti))
    assert first_record is not None
    first_record.revoked_at = datetime.now(UTC) - timedelta(seconds=10)
    await session.commit()

    # «Злоумышленник» предъявляет уже использованный токен — это reuse.
    attacker = await client.post("/auth/refresh", json={"refresh": first_refresh})
    assert attacker.status_code == 401
    assert "reuse" in attacker.json()["detail"].lower()

    # Теперь даже легитимный second_refresh должен быть отозван:
    # семья объявлена скомпрометированной целиком.
    legit = await client.post("/auth/refresh", json={"refresh": second_refresh})
    assert legit.status_code == 401

    # Проверим инвариант на уровне БД: ни одного не-отозванного токена
    # в семье не осталось.
    rows = (await session.execute(select(RefreshToken))).scalars().all()
    assert rows, "записи должны существовать в реестре"
    assert all(r.revoked_at is not None for r in rows), (
        "после reuse-detection все токены семьи должны быть revoked_at != NULL"
    )


# ---------------------------------------------------------------------------
# 3. Logout — explicit revocation одного refresh.
# ---------------------------------------------------------------------------


async def test_logout_revokes_refresh(client):
    creds = await _register(client, email="logout@example.com")
    rt = creds["refresh"]

    out = await client.post("/auth/logout", json={"refresh": rt})
    assert out.status_code == 204

    # Использовать после logout нельзя.
    resp = await client.post("/auth/refresh", json={"refresh": rt})
    assert resp.status_code == 401


async def test_logout_is_idempotent(client):
    """Повторный logout того же токена возвращает 204, не 4xx."""
    creds = await _register(client, email="idem@example.com")
    rt = creds["refresh"]

    first = await client.post("/auth/logout", json={"refresh": rt})
    second = await client.post("/auth/logout", json={"refresh": rt})
    assert first.status_code == 204
    assert second.status_code == 204


async def test_logout_garbage_token_returns_204(client):
    """Logout не выдаёт оракул «знаешь ли ты валидный jti»."""
    out = await client.post("/auth/logout", json={"refresh": "this.is.not.a.jwt"})
    assert out.status_code == 204


async def test_logout_does_not_revoke_sibling_session(client, session):
    """Logout одного устройства не выкидывает другие активные сессии.

    Один пользователь с двух устройств → две независимые семьи
    refresh-токенов. Logout одной не должен трогать вторую.
    """
    # Два независимых login-а одного пользователя — каждый получает
    # свою семью. Делаем это через register + login (одинаковый
    # пользователь, два refresh).
    reg = await client.post(
        "/auth/register",
        json={"email": "two-devices@example.com", "password": "Device-pw-1234"},
    )
    refresh_a = reg.cookies.get("cwh_refresh")
    assert refresh_a

    login = await client.post(
        "/auth/login",
        json={"email": "two-devices@example.com", "password": "Device-pw-1234"},
    )
    assert login.status_code == 200
    refresh_b = login.cookies.get("cwh_refresh")
    assert refresh_b
    assert refresh_a != refresh_b

    # Logout одного устройства.
    out = await client.post("/auth/logout", json={"refresh": refresh_a})
    assert out.status_code == 204

    # Refresh со второго устройства всё ещё работает.
    still = await client.post("/auth/refresh", json={"refresh": refresh_b})
    assert still.status_code == 200


# ---------------------------------------------------------------------------
# 4. Реестр — отказ при unknown jti / sub-mismatch / БД-таймскью.
# ---------------------------------------------------------------------------


async def test_unknown_jti_is_rejected(client):
    """Самосгенерированный JWT с валидной подписью, но без записи в реестре."""
    # `create_refresh_token` использует наш JWT_SECRET — подпись валидна,
    # но мы НЕ регистрируем его в БД (это «orphan» токен).
    orphan = create_refresh_token("00000000-0000-0000-0000-000000000000")
    resp = await client.post("/auth/refresh", json={"refresh": orphan})
    assert resp.status_code == 401


async def test_jti_user_mismatch_is_rejected(client, session):
    """JWT с подменённым sub (тот же jti, но другой user) → 401."""
    creds = await _register(client, email="mismatch@example.com")
    legit = creds["refresh"]
    decoded = jwt.decode(
        legit,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )
    forged_payload = dict(decoded)
    forged_payload["sub"] = "00000000-0000-0000-0000-000000000000"
    forged = jwt.encode(forged_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    resp = await client.post("/auth/refresh", json={"refresh": forged})
    assert resp.status_code == 401

    # Семья при таком 401 НЕ должна быть отозвана: жертва — не она,
    # это атакующий с другого аккаунта пытается воспользоваться
    # чужим jti.
    record = (
        await session.execute(select(RefreshToken).where(RefreshToken.jti == decoded["jti"]))
    ).scalar_one()
    assert record.revoked_at is None


async def test_db_expiry_rejects_when_jwt_still_valid(client, session):
    """Если в БД токен помечен expired (clock-skew), refresh = 401."""
    creds = await _register(client, email="skew@example.com")
    legit = creds["refresh"]
    decoded = jwt.decode(legit, settings.jwt_secret, algorithms=[settings.jwt_algorithm])

    # Сдвигаем expires_at записи в прошлое, JWT-exp не трогаем.
    record = (
        await session.execute(select(RefreshToken).where(RefreshToken.jti == decoded["jti"]))
    ).scalar_one()
    record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await session.commit()

    resp = await client.post("/auth/refresh", json={"refresh": legit})
    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()


async def test_jwt_invalid_signature_rejected_before_db(client):
    """Неверная подпись = 401, без обращения к реестру."""
    bogus = jwt.encode(
        {"sub": "x", "type": "refresh", "jti": "deadbeef" * 4, "exp": 9999999999},
        "wrong-secret",
        algorithm=settings.jwt_algorithm,
    )
    resp = await client.post("/auth/refresh", json={"refresh": bogus})
    assert resp.status_code == 401


async def test_access_token_rejected_at_refresh(client, client_token):
    """Тип-mismatch access≠refresh → 401."""
    resp = await client.post("/auth/refresh", json={"refresh": client_token})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 5. Целостность реестра — login создаёт запись, поля заполнены.
# ---------------------------------------------------------------------------


async def test_register_creates_refresh_record(client, session):
    creds = await _register(client, email="record@example.com")
    decoded = jwt.decode(
        creds["refresh"],
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )

    record = (
        await session.execute(select(RefreshToken).where(RefreshToken.jti == decoded["jti"]))
    ).scalar_one()
    assert record.revoked_at is None
    assert record.parent_jti is None  # это голова семьи
    assert record.replaced_by_jti is None
    assert record.family_id is not None
    # exp в JWT и в БД должны совпадать (с точностью до секунд).
    assert int(record.expires_at.timestamp()) == int(decoded["exp"])


async def test_login_creates_separate_family(client, session):
    """Login и register — две разные семьи у одного юзера."""
    await client.post(
        "/auth/register",
        json={"email": "fam@example.com", "password": "Fam-pw-1234"},
    )

    log = await client.post(
        "/auth/login",
        json={"email": "fam@example.com", "password": "Fam-pw-1234"},
    )
    assert log.status_code == 200

    rows = (await session.execute(select(RefreshToken))).scalars().all()
    assert len(rows) == 2
    assert {r.family_id for r in rows} == {rows[0].family_id, rows[1].family_id}
    assert rows[0].family_id != rows[1].family_id


async def test_rotation_chain_links_records(client, session):
    """Поля parent_jti / replaced_by_jti корректно склеены."""
    creds = await _register(client, email="chain-link@example.com")
    decoded_old = jwt.decode(
        creds["refresh"],
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )

    rotated = await client.post("/auth/refresh", json={"refresh": creds["refresh"]})
    assert rotated.status_code == 200
    decoded_new = jwt.decode(
        rotated.cookies.get("cwh_refresh"),
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )

    old = (
        await session.execute(select(RefreshToken).where(RefreshToken.jti == decoded_old["jti"]))
    ).scalar_one()
    new = (
        await session.execute(select(RefreshToken).where(RefreshToken.jti == decoded_new["jti"]))
    ).scalar_one()

    assert old.replaced_by_jti == new.jti
    assert old.revoked_at is not None
    assert new.parent_jti == old.jti
    assert new.family_id == old.family_id
    assert new.revoked_at is None


# ---------------------------------------------------------------------------
# 6. Disabled / удалённый пользователь — refresh должен падать.
# ---------------------------------------------------------------------------


async def test_disabled_user_cannot_refresh(client, session):
    """is_active=False → /refresh возвращает 401."""
    creds = await _register(client, email="dis@example.com")
    refresh_token = creds["refresh"]

    # Деактивируем пользователя через ORM.
    from app.models.user import User

    user = (await session.execute(select(User).where(User.email == "dis@example.com"))).scalar_one()
    user.is_active = False
    await session.commit()

    resp = await client.post("/auth/refresh", json={"refresh": refresh_token})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 7. Password reset — все refresh-семьи user-а должны отозваться.
# ---------------------------------------------------------------------------


async def test_password_reset_revokes_all_refresh_tokens(client, session):
    """После reset-confirm активные refresh-токены становятся 401."""
    from app.models.password_reset import PasswordReset
    from app.models.user import User

    # Регистрируем юзера с двумя сессиями.
    reg = await client.post(
        "/auth/register",
        json={"email": "reset-revoke@example.com", "password": "Pw-very-good1"},
    )
    rt_a = reg.cookies.get("cwh_refresh")
    assert rt_a
    log = await client.post(
        "/auth/login",
        json={"email": "reset-revoke@example.com", "password": "Pw-very-good1"},
    )
    rt_b = log.cookies.get("cwh_refresh")
    assert rt_b

    # Имитируем свежий reset — кладём напрямую в БД (как делает
    # /password/reset-request, но без SMTP).
    import hashlib

    raw_token = "raw-secret-token-for-test"
    user = (
        await session.execute(select(User).where(User.email == "reset-revoke@example.com"))
    ).scalar_one()
    session.add(
        PasswordReset(
            user_id=user.id,
            email=user.email,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
        )
    )
    await session.commit()

    confirm = await client.post(
        "/auth/password/reset-confirm",
        json={"token": raw_token, "password": "Brand-new-pw-9876"},
    )
    assert confirm.status_code == 204

    # Оба refresh-токена должны быть отозваны.
    for rt in (rt_a, rt_b):
        resp = await client.post("/auth/refresh", json={"refresh": rt})
        assert resp.status_code == 401, "после смены пароля старые refresh-ы должны быть невалидны"

    # И в БД оба revoked.
    rows = (
        (await session.execute(select(RefreshToken).where(RefreshToken.user_id == user.id)))
        .scalars()
        .all()
    )
    assert rows
    assert all(r.revoked_at is not None for r in rows)


# ---------------------------------------------------------------------------
# 8. mint_refresh_token sanity — клейми JWT и dataclass совпадают.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio(loop_scope="session")
async def test_mint_refresh_token_returns_consistent_metadata():
    """JWT и dataclass должны возвращать одинаковые jti / exp."""
    issued = mint_refresh_token("11111111-1111-1111-1111-111111111111")
    decoded = jwt.decode(
        issued.token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )
    assert decoded["jti"] == issued.jti
    assert int(issued.expires_at.timestamp()) == int(decoded["exp"])
    assert decoded["type"] == "refresh"
