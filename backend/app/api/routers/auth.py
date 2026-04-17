"""Authentication endpoints: register, login, refresh, password reset, me."""
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, get_current_user
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.models.enums import AppRole
from app.models.user import User
from app.schemas.auth import (
    AccessToken,
    LoginIn,
    LoginOut,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    PasswordResetRequestOut,
    RefreshIn,
    RegisterIn,
)
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_login(user: User) -> LoginOut:
    access = create_access_token(str(user.id), is_admin=user.is_admin)
    refresh = create_refresh_token(str(user.id))
    return LoginOut(access=access, refresh=refresh, user=UserOut.model_validate(user))


@router.post("/register", response_model=LoginOut, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterIn, session: AsyncSession = Depends(db_session)) -> LoginOut:
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
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email already registered",
        ) from exc
    await session.refresh(user)
    return _issue_login(user)


@router.post("/login", response_model=LoginOut)
async def login(payload: LoginIn, session: AsyncSession = Depends(db_session)) -> LoginOut:
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
        await session.commit()
        await session.refresh(user)

    return _issue_login(user)


@router.post("/refresh", response_model=AccessToken)
async def refresh(payload: RefreshIn, session: AsyncSession = Depends(db_session)) -> AccessToken:
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

    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found or disabled"
        )

    return AccessToken(access=create_access_token(str(user.id), is_admin=user.is_admin))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/password/reset-request", response_model=PasswordResetRequestOut)
async def password_reset_request(
    payload: PasswordResetRequestIn,
    session: AsyncSession = Depends(db_session),
) -> PasswordResetRequestOut:
    """Issue a password reset token for the given email.

    Never leaks whether the email is registered — always returns `ok: true`.
    In `development` / `test` the raw token is returned in the response so that
    the client flow can be exercised without an email transport.
    """
    user = await session.scalar(select(User).where(User.email == payload.email.lower()))
    token: str | None = None
    if user is not None and user.is_active:
        token = create_password_reset_token(str(user.id))
        # TODO: send `token` via email transport in production.

    expose_token = settings.app_env != "production"
    return PasswordResetRequestOut(ok=True, reset_token=token if expose_token else None)


@router.post("/password/reset-confirm", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_confirm(
    payload: PasswordResetConfirmIn,
    session: AsyncSession = Depends(db_session),
) -> None:
    try:
        claims = decode_token(payload.token, expected_type="reset")
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="reset token expired"
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid reset token"
        ) from exc

    try:
        user_id = UUID(claims["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid reset token"
        ) from exc

    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid reset token")

    user.password_hash = hash_password(payload.password)
    await session.commit()
