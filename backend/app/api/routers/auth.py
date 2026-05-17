"""Authentication endpoints: register, login, refresh, logout, password reset, me."""
import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode, urljoin
from uuid import UUID, uuid4

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, get_current_user
from app.core.config import settings
from app.core.rate_limit import (
    LOGIN_LIMIT,
    PASSWORD_RESET_REQUEST_LIMIT,
    REFRESH_LIMIT,
    REGISTER_LIMIT,
    limiter,
)
from app.core.email import send_email
from app.core.email_templates import EmailSender, render_password_reset_email
from app.core.security import (
    IssuedRefreshToken,
    create_access_token,
    decode_token,
    hash_password,
    mint_refresh_token,
    needs_rehash,
    verify_password,
)
from app.models.company import CompanySettings
from app.models.enums import AppRole
from app.models.password_reset import PasswordReset
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import (
    LoginIn,
    LoginOut,
    LogoutIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    PasswordResetRequestOut,
    RefreshIn,
    RefreshOut,
    RegisterIn,
)
from app.schemas.user import UserOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Синглтон с реквизитами компании — используем id=1, как в orders.py.
_COMPANY_SETTINGS_ID = 1


def _hash_reset_token(raw: str) -> str:
    """SHA-256(raw).hex() — короче bcrypt/argon2, но этого достаточно.

    Сам токен — ``secrets.token_urlsafe(32)`` (≈256 бит энтропии), так что
    брутфорс хеша вычислительно нереален. Использовать argon2 тут значит
    только платить CPU на каждом reset-confirm без реального выигрыша.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _email_tag(email: str) -> str:
    """Короткий стабильный хэш для логов, не раскрывающий e-mail.

    Достаточно для корреляции связанных событий в логах (все записи
    про одного юзера получают один и тот же 12-символьный tag), и
    вычислительно нереально восстановить из этого исходный адрес (12 hex
    чар = 48 бит) — хотя при утечке базы адресов SHA-256 похешированной
    колонки легко разворачивается offline; этого и хватит — в логах обычно
    нет всех адресов, только хэши.
    """
    return hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:12]


def _build_reset_url(raw_token: str) -> str:
    """Собирает публичную ссылку вида ``{WEB_APP_URL}/reset-password?token=...``.

    ``urljoin`` корректно обрабатывает и URL с/без конечного слэша, а
    ``urlencode`` экранирует токен — хотя ``token_urlsafe`` уже URL-safe,
    мы не полагаемся на это на случай будущей смены генератора.
    """
    base = settings.web_app_url.rstrip("/") + "/"
    return urljoin(base, "reset-password") + "?" + urlencode({"token": raw_token})


async def _send_reset_email_safe(
    *,
    to_email: str,
    reset_url: str,
    ttl_minutes: int,
    sender: EmailSender,
) -> None:
    """Фоновая отправка письма. Ошибки только логируем.

    HTTP-ответ уже улетел клиенту к моменту выполнения таска, поэтому
    никаких исключений наверх пробрасывать нельзя. SMTP-недоступность,
    таймауты, DNS и т.д. — всё это должен видеть только ops в логах,
    клиент всегда получает одинаковый ``ok: true`` (см. комментарий
    в эндпоинте reset-request про защиту от enumeration).
    """
    subject = f"Сброс пароля в {sender.company_name or 'CANDWAX'}"
    plain_body, html_body = render_password_reset_email(
        reset_url=reset_url,
        ttl_minutes=ttl_minutes,
        sender=sender,
    )
    # Лог «отправляем» вынесен отдельно, чтобы в логах было видно сам
    # факт запуска фонового таска — иначе при внешних проблемах (spam,
    # DNS, timeout) непонятно, дошло ли дело до SMTP вообще.
    #
    # В логах вместо raw email — короткий SHA-256-тэг: PII из логов
    # не вытащишь, а для корреляции записей тега достаточно.
    tag = _email_tag(to_email)
    logger.info(
        "Password-reset: sending email user_tag=%s via %s:%s",
        tag, settings.smtp_host, settings.smtp_port,
    )
    try:
        await send_email(
            to_email=to_email,
            subject=subject,
            body=plain_body,
            html_body=html_body,
        )
    except Exception:
        logger.exception("Password-reset email FAILED (user_tag=%s)", tag)
        return
    logger.info("Password-reset: email accepted by SMTP (user_tag=%s)", tag)


def _client_ip(request: Request) -> str | None:
    """Best-effort клиентский IP из запроса.

    Сознательно не разбираем ``X-Forwarded-For`` тут: в продакшене
    perimeter (nginx/traefik) уже должен ставить ``request.client.host``
    из доверенного proxy-protocol источника. Парсить заголовок ниже —
    значит доверять любому, кто его пришлёт. Для аудит-целей нам и
    ``request.client.host`` достаточно.
    """
    return request.client.host if request.client else None


def _client_user_agent(request: Request) -> str | None:
    ua = request.headers.get("user-agent")
    # Не храним длинные UA: в реестре поле ограничено 512 символами.
    if ua and len(ua) > 512:
        ua = ua[:512]
    return ua


async def _record_refresh(
    session: AsyncSession,
    *,
    user_id: UUID,
    issued: IssuedRefreshToken,
    family_id: UUID,
    parent_jti: str | None,
    request: Request,
) -> None:
    """Регистрируем только что выпущенный refresh в реестре.

    Запись в БД делается в той же транзакции, в которой потом будет
    отдан JWT клиенту — ``session.commit()`` вызывает caller. Если
    транзакция упадёт, JWT тоже не уйдёт (handler вернёт 500), и
    несинхронизованного состояния не возникнет.
    """
    record = RefreshToken(
        jti=issued.jti,
        user_id=user_id,
        family_id=family_id,
        parent_jti=parent_jti,
        replaced_by_jti=None,
        expires_at=issued.expires_at,
        revoked_at=None,
        user_agent=_client_user_agent(request),
        ip=_client_ip(request),
    )
    session.add(record)


async def _revoke_family(session: AsyncSession, family_id: UUID) -> None:
    """Массово отозвать все ещё-активные токены данной семьи.

    Используется в двух сценариях:

    * **reuse-detection:** клиент принёс уже-ротированный refresh —
      это или гонка, или утечка. Безопаснее всех родственников
      выкинуть и заставить перелогиниться.
    * **logout-all** (на будущее, не реализовано в текущей итерации).
    """
    now = datetime.now(UTC)
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.family_id == family_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )


async def _issue_login(
    session: AsyncSession, user: User, request: Request
) -> LoginOut:
    """Выпустить пару access+refresh для свежего login/register.

    Каждая пара начинает новую refresh-семью: ``family_id = uuid4()``,
    ``parent_jti = NULL``. Зарегестрированная запись имеет
    ``revoked_at IS NULL`` — и именно это инвариант проверяет
    последующий ``/refresh``.
    """
    access = create_access_token(str(user.id), is_admin=user.is_admin)
    issued = mint_refresh_token(str(user.id))
    family_id = uuid4()
    await _record_refresh(
        session,
        user_id=user.id,
        issued=issued,
        family_id=family_id,
        parent_jti=None,
        request=request,
    )
    return LoginOut(
        access=access,
        refresh=issued.token,
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=LoginOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(REGISTER_LIMIT)
async def register(
    request: Request,  # required by slowapi key_func; do not remove
    payload: RegisterIn,
    session: AsyncSession = Depends(db_session),
) -> LoginOut:
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=AppRole.client,
        company_name=payload.company_name,
        contact_name=payload.contact_name,
        phone=payload.phone,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email already registered",
        ) from exc
    out = await _issue_login(session, user, request)
    await session.commit()
    return out


@router.post("/login", response_model=LoginOut)
@limiter.limit(LOGIN_LIMIT)
async def login(
    request: Request,  # required by slowapi key_func; do not remove
    payload: LoginIn,
    session: AsyncSession = Depends(db_session),
) -> LoginOut:
    user = await session.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="user disabled")

    # Opportunistic rehash when argon2 parameters are upgraded.
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)

    out = await _issue_login(session, user, request)
    await session.commit()
    return out


@router.post("/refresh", response_model=RefreshOut)
@limiter.limit(REFRESH_LIMIT)
async def refresh(
    request: Request,  # required by slowapi key_func; do not remove
    payload: RefreshIn,
    session: AsyncSession = Depends(db_session),
) -> RefreshOut:
    """Обмен refresh→(access, refresh) с rotation и reuse-detection.

    Алгоритм:

    1. Декодируем JWT — проверка подписи и ``exp``. Любая ошибка
       криптовалидации = 401 ``invalid refresh``.
    2. По ``jti`` ищем запись в реестре. Нет записи — токен либо
       поддельный (с валидной подписью, но не нашим сервером),
       либо мы потеряли БД-состояние; и то, и другое — 401.
    3. Если запись revoked, разбираем подкейсы:
       * ``replaced_by_jti IS NOT NULL`` — это **reuse**: кто-то
         предъявляет уже-ротированный токен. Отзываем всю семью,
         возвращаем 401 reuse.
       * ``replaced_by_jti IS NULL`` — explicit logout / админ
         отозвал. 401 без отзыва семьи (она и так уже отозвана при
         logout-all, либо тут просто ничего не делаем).
    4. Если запись expired в БД (``expires_at <= now``) — на всякий
       случай защита от time-skew между ``jwt.decode`` и БД-часами;
       тоже 401.
    5. Проверяем пользователя: существует и активен.
    6. **Атомарно**: новый refresh выписан, в реестр добавляется
       новая запись с тем же ``family_id`` и ``parent_jti = old.jti``,
       а старая помечается ``revoked_at = now()``,
       ``replaced_by_jti = new.jti``. ``commit()`` единый.

    Из-за единого commit'а гонка «два параллельных refresh с одним и
    тем же токеном» закончится тем, что оба запросa напишут новую
    запись и пометят старую revoked, но второй запрос НЕ обнаружит
    reuse: он успел зайти до пометки старого. Это не критично — обе
    новые refresh-записи легитимны (один и тот же клиент). Если
    клиент действительно ОДИН, он отбросит «лишний» рефреш. Если
    клиентов двое — вторая попытка предъявить **старый** refresh уже
    после ротации сработает как reuse и отзовёт family.
    """
    try:
        claims = decode_token(payload.refresh, expected_type="refresh")
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh expired"
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh"
        ) from exc

    try:
        user_id = UUID(claims["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh"
        ) from exc

    jti = claims.get("jti")
    if not isinstance(jti, str) or not jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh"
        )

    record = await session.get(RefreshToken, jti)
    if record is None:
        # JWT валиден по подписи, но мы такой не выпускали (или БД
        # очищена). Любая попытка использовать неизвестный refresh —
        # это либо подделка, либо приходит из старой эры до этой
        # миграции; в обоих случаях 401.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh"
        )

    if record.user_id != user_id:
        # Подменили sub в JWT (или повредили БД). Не доверяем — 401.
        # Семью НЕ отзываем: жертва атаки тут — не семья этого jti.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh"
        )

    if record.revoked_at is not None:
        if record.replaced_by_jti is not None:
            # REUSE: предъявлен токен, который мы уже когда-то
            # ротировали. Это сильный сигнал утечки: легитимный
            # клиент не имеет причин предъявлять «второй раз», у него
            # уже новый. Отзываем всю семью.
            logger.warning(
                "Refresh REUSE detected: jti=%s family=%s user_id=%s — revoking family",
                jti, record.family_id, record.user_id,
            )
            await _revoke_family(session, record.family_id)
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="refresh reuse detected",
            )
        # Просто отозван (logout / админ-action). Без шумного warning.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh revoked"
        )

    # Защита от time-skew: если БД считает, что токен уже истёк, но
    # ``jwt.decode`` пропустил — всё равно отказываем.
    now = datetime.now(UTC)
    if record.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh expired"
        )

    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found or disabled"
        )

    # Rotation: новая refresh-запись + revoke старой в одной транзакции.
    issued = mint_refresh_token(str(user.id))
    await _record_refresh(
        session,
        user_id=user.id,
        issued=issued,
        family_id=record.family_id,
        parent_jti=record.jti,
        request=request,
    )
    record.revoked_at = now
    record.replaced_by_jti = issued.jti

    access = create_access_token(str(user.id), is_admin=user.is_admin)
    await session.commit()
    return RefreshOut(access=access, refresh=issued.token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: LogoutIn,
    session: AsyncSession = Depends(db_session),
) -> None:
    """Отзываем предъявленный refresh-токен.

    Намеренно идемпотентно: если токен невалиден, уже отозван или
    отсутствует в реестре — отвечаем тем же 204, что и при успешном
    отзыве. Это:

    * уменьшает поверхность для probing'а («жив ли этот jti?»);
    * делает ретрай-логику клиента тривиальной (повторный logout —
      no-op).

    Логаут НЕ требует валидного access-токена: достаточно того, что
    клиент знает свой собственный refresh. Это удобно при истёкшем
    access — пользователь всё равно может корректно завершить
    сессию.
    """
    try:
        claims = decode_token(payload.refresh, expected_type="refresh")
    except jwt.PyJWTError:
        return

    jti = claims.get("jti")
    if not isinstance(jti, str) or not jti:
        return

    record = await session.get(RefreshToken, jti)
    if record is None or record.revoked_at is not None:
        return

    record.revoked_at = datetime.now(UTC)
    await session.commit()


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/password/reset-request", response_model=PasswordResetRequestOut)
@limiter.limit(PASSWORD_RESET_REQUEST_LIMIT)
async def password_reset_request(
    request: Request,  # required by slowapi key_func; do not remove
    payload: PasswordResetRequestIn,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(db_session),
) -> PasswordResetRequestOut:
    """Выдать ссылку на сброс пароля и отправить её на email.

    В ответе НИКОГДА не раскрывается, зарегистрирован ли email в базе —
    всегда возвращаем одинаковый ``ok: true``. Это защита от user
    enumeration: злоумышленник не должен уметь отличать «адрес есть»
    от «адреса нет» по ответу сервера.

    Под капотом:
    1. Ищем пользователя по email (приводим к нижнему регистру).
    2. Если активный пользователь нашёлся — генерируем криптостойкий
       ``secrets.token_urlsafe(32)``, сохраняем в БД **только хеш**
       ``SHA-256(token)``, а сырой токен отправляем в письме.
    3. Удаляем все ранее выданные токены этого пользователя — чтобы
       «старые письма» сразу переставали работать и таблица не пухла.
    4. Ссылку шлём в фоновом таске: SMTP-handshake обычно 300–800мс,
       блокировать HTTP-ответ на этом нельзя.
    """
    user = await session.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not user.is_active:
        # Отдаём тот же 200 OK, что и для существующего email. Тайминг
        # может слегка отличаться (нет записи в БД, нет background task),
        # но это на порядки меньше сетевого джиттера и enumeration-атакой
        # не эксплуатируется.
        return PasswordResetRequestOut(ok=True)

    # Чистим предыдущие токены этого пользователя. Если человек кликнул
    # «Забыли пароль?» дважды — рабочей остаётся только последняя ссылка.
    await session.execute(
        delete(PasswordReset).where(PasswordReset.user_id == user.id)
    )

    raw_token = secrets.token_urlsafe(32)
    reset = PasswordReset(
        user_id=user.id,
        email=user.email,
        token_hash=_hash_reset_token(raw_token),
    )
    session.add(reset)
    await session.commit()

    # Если SMTP не настроен — ничего не отправляем. Раньше сюда ложился
    # сырой reset-токен на уровне WARNING — это было prod-grade багом
    # безопасности: любой, кто видел application logs (SRE, лог-
    # агрегатор, бэкап), получал полный account takeover. Сейчас
    # логируем только факт и user_tag; из БД админ при необходимости
    # вывыпишет свежий токен вручную (старый в БД хранится только
    # как SHA-256-хеш, сырой потерян).
    if not settings.smtp_host:
        logger.warning(
            "SMTP is not configured; password reset email NOT sent "
            "(user_tag=%s). Token persisted; admin can re-issue from DB.",
            _email_tag(user.email),
        )
        return PasswordResetRequestOut(ok=True)

    company = await session.get(CompanySettings, _COMPANY_SETTINGS_ID)
    sender = EmailSender(
        company_name=(company.short_name if company else "CANDWAX"),
        phone=(company.phone if company else ""),
        email=(company.email if company else ""),
    )

    background_tasks.add_task(
        _send_reset_email_safe,
        to_email=user.email,
        reset_url=_build_reset_url(raw_token),
        ttl_minutes=settings.password_reset_ttl_min,
        sender=sender,
    )
    return PasswordResetRequestOut(ok=True)


@router.post("/password/reset-confirm", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_confirm(
    payload: PasswordResetConfirmIn,
    session: AsyncSession = Depends(db_session),
) -> None:
    """Принять сырой токен из письма и установить новый пароль.

    Проверки:
    * Токен существует в таблице ``password_resets`` (по его SHA-256-хешу).
    * С момента создания прошло не больше ``PASSWORD_RESET_TTL_MIN`` минут.
    * Прикреплённый пользователь всё ещё активен.

    Любая из причин «не существует / протух / заблокирован» отдаёт один
    и тот же ``400 invalid reset token`` — чтобы клиент не мог
    различать эти случаи (и тем более — собирать список действующих
    токенов перебором).
    """
    token_hash = _hash_reset_token(payload.token)
    reset = await session.scalar(
        select(PasswordReset).where(PasswordReset.token_hash == token_hash)
    )
    if reset is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid reset token"
        )

    # TTL проверяем в Python — у нас уже есть `created_at` из записи,
    # и нам не нужен round-trip в БД за `NOW()`. Работаем в UTC, чтобы
    # не зависеть от TZ-настроек Postgres/приложения.
    age = datetime.now(UTC) - reset.created_at
    if age > timedelta(minutes=settings.password_reset_ttl_min):
        # Протух — сразу чистим запись, чтобы не оставалась в базе.
        await session.delete(reset)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid reset token"
        )

    user = await session.scalar(select(User).where(User.id == reset.user_id))
    if user is None or not user.is_active:
        # Пользователь удалён/заблокирован — токен инвалидируем.
        await session.delete(reset)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid reset token"
        )

    user.password_hash = hash_password(payload.password)
    # Одноразовость: удаляем именно эту запись. Все остальные записи
    # этого пользователя уже были выпилены на этапе reset-request, но
    # на всякий случай подчистим и их — если где-то логика расширится.
    await session.execute(
        delete(PasswordReset).where(PasswordReset.user_id == user.id)
    )
    # Смена пароля = считаем все ранее выданные refresh-токены
    # скомпрометированными. Кто-то либо угнал пароль (и знает refresh
    # тоже), либо сам пользователь нажал «забыли пароль» из-за
    # подозрений. В обоих случаях единственный безопасный путь —
    # выкинуть все активные сессии. Новый login сразу после
    # reset-confirm выдаст свежую refresh-семью.
    now = datetime.now(UTC)
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    await session.commit()
