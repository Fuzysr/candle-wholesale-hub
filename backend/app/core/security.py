from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings

TokenType = Literal["access", "refresh"]


@dataclass(frozen=True)
class IssuedRefreshToken:
    """Метаинформация о только что выпущенном refresh-токене.

    Возвращается из ``mint_refresh_token``, чтобы вызывающий код мог
    одной операцией:

    * вернуть JWT клиенту (``token``);
    * сохранить запись в реестре ``refresh_tokens`` (``jti``,
      ``expires_at``) для последующих revocation / rotation решений.

    Сами клейми внутри JWT и здесь должны совпадать — единый источник
    правды для них именно ``mint_refresh_token`` (см. реализацию ниже).
    """

    token: str
    jti: str
    expires_at: datetime


_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        _hasher.verify(hashed, password)
        return True
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def needs_rehash(hashed: str) -> bool:
    try:
        return _hasher.check_needs_rehash(hashed)
    except Exception:
        return False


def _create_token(
    subject: str,
    token_type: TokenType,
    ttl: timedelta,
    extra: dict[str, Any] | None = None,
    jti: str | None = None,
) -> tuple[str, str, datetime]:
    """Возвращает ``(jwt, jti, expires_at)``.

    ``jti`` опционален: на refresh-rotation мы хотим заранее знать
    идентификатор, потому что нужно одновременно вставить запись в
    реестр и обновить родительскую запись с ``replaced_by_jti``. Если
    не передан — генерим новый ``uuid4().hex``.
    """
    now = datetime.now(UTC)
    expires_at = now + ttl
    final_jti = jti or uuid4().hex
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": final_jti,
    }
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, final_jti, expires_at


def create_access_token(subject: str, *, is_admin: bool = False) -> str:
    token, _jti, _exp = _create_token(
        subject,
        "access",
        timedelta(minutes=settings.access_token_ttl_min),
        extra={"is_admin": is_admin},
    )
    return token


def mint_refresh_token(subject: str) -> IssuedRefreshToken:
    """Выпустить новый refresh-токен и вернуть всю мета-инфу для реестра.

    ``IssuedRefreshToken.jti``/``expires_at`` ровно те же, что
    закодированы внутри ``token`` — используются вызывающим кодом для
    вставки записи в таблицу ``refresh_tokens`` без повторного
    декодирования JWT.
    """
    token, jti, expires_at = _create_token(
        subject,
        "refresh",
        timedelta(days=settings.refresh_token_ttl_days),
    )
    return IssuedRefreshToken(token=token, jti=jti, expires_at=expires_at)


def create_refresh_token(subject: str) -> str:
    """Backward-compatible helper. New code should use ``mint_refresh_token``.

    Оставлен только для тестов и кода, которому реестровые поля не
    нужны (например, синтетические токены в pen-тестах). В проде это
    путь не используется — login/refresh идут через
    ``mint_refresh_token``.
    """
    return mint_refresh_token(subject).token


def decode_token(token: str, *, expected_type: TokenType | None = None) -> dict[str, Any]:
    """Decode a JWT and optionally enforce its `type` claim. Raises jwt exceptions on failure."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if expected_type and payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(f"unexpected token type: {payload.get('type')}")
    return payload
