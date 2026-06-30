"""Shared FastAPI dependencies: DB session, current user, role guards."""

from collections.abc import AsyncGenerator
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_cookies import ACCESS_COOKIE
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_db():
        yield session


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(db_session),
) -> User:
    """Resolve a user from Bearer auth or the browser's HttpOnly cookie."""
    token: str | None = None
    if credentials is not None and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    elif credentials is None:
        token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise _unauthorized("missing access token")

    try:
        payload = decode_token(token, expected_type="access")
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise _unauthorized("invalid token") from exc

    sub = payload.get("sub")
    if not sub:
        raise _unauthorized("invalid token payload")

    try:
        user_id = UUID(sub)
    except (ValueError, TypeError) as exc:
        raise _unauthorized("invalid subject") from exc

    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise _unauthorized("user not found or disabled")
    return user


async def get_current_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(db_session),
) -> User | None:
    """Resolve an optional identity without downgrading authentication errors.

    No Authorization header means an anonymous request. Once a caller sends a
    Bearer token, however, it must be valid: expired, malformed and disabled-
    user tokens remain 401 responses instead of silently entering guest flows.
    """
    if credentials is None and not request.cookies.get(ACCESS_COOKIE):
        return None
    return await get_current_user(request=request, credentials=credentials, session=session)


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")
    if settings.admin_mfa_required and settings.app_env == "production" and not user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin_mfa_enrollment_required",
        )
    return user
