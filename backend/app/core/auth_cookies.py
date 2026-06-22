"""Single source of truth for browser authentication cookie policy."""

import secrets

from fastapi import Response

from app.core.config import settings

ACCESS_COOKIE = "cwh_access"
REFRESH_COOKIE = "cwh_refresh"
CSRF_COOKIE = "cwh_csrf"
CSRF_HEADER = "x-csrf-token"


def _common_cookie_options() -> dict[str, str | bool | None]:
    return {
        "secure": settings.app_env == "production",
        "samesite": settings.auth_cookie_samesite,
        "domain": settings.auth_cookie_domain,
    }


def set_auth_cookies(response: Response, *, access: str, refresh: str) -> None:
    """Persist browser credentials without exposing JWT values to JavaScript."""
    common = _common_cookie_options()
    response.set_cookie(
        ACCESS_COOKIE,
        access,
        max_age=settings.access_token_ttl_min * 60,
        httponly=True,
        path="/",
        **common,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        httponly=True,
        path="/auth",
        **common,
    )
    # Double-submit token: readable by the SPA, useless as authentication.
    response.set_cookie(
        CSRF_COOKIE,
        secrets.token_urlsafe(32),
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        httponly=False,
        path="/",
        **common,
    )


def clear_auth_cookies(response: Response) -> None:
    common = _common_cookie_options()
    response.delete_cookie(ACCESS_COOKIE, path="/", httponly=True, **common)
    response.delete_cookie(REFRESH_COOKIE, path="/auth", httponly=True, **common)
    response.delete_cookie(CSRF_COOKIE, path="/", httponly=False, **common)
