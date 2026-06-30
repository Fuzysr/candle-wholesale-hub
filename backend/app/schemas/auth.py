import re

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import UserOut

_PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$")
_PASSWORD_HINT = (
    "Пароль должен содержать минимум 8 символов, одну заглавную, одну строчную букву и одну цифру"
)


def _validate_password_strength(v: str) -> str:
    if not _PASSWORD_RE.match(v):
        raise ValueError(_PASSWORD_HINT)
    return v


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    company_name: str | None = None
    contact_name: str | None = None
    phone: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    mfa_code: str | None = Field(default=None, pattern=r"^\d{6}$")


class MfaCodeIn(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class MfaSetupOut(BaseModel):
    secret: str
    provisioning_uri: str


class MfaStatusOut(BaseModel):
    enabled: bool


class RefreshIn(BaseModel):
    """Optional body fallback for non-browser API clients."""

    refresh: str | None = None


class LogoutIn(BaseModel):
    """То же поле, что и в RefreshIn: предъявить refresh для отзыва.

    Логаут именно по refresh-токену, а не по access: access короткоживущий
    и ставить его в чёрный список в реестре дороже, чем дождаться TTL.
    Refresh — длинный, его реальная отзываемость и есть основной выигрыш
    реестра.
    """

    refresh: str | None = None


class RefreshOut(BaseModel):
    """JWT values stay exclusively in HttpOnly response cookies."""

    ok: bool = True


class LoginOut(BaseModel):
    user: UserOut


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class PasswordResetRequestOut(BaseModel):
    """Ответ на `/auth/password/reset-request`.

    Сознательно не раскрывает, найден ли пользователь по email: любая
    дополнительная информация здесь превратила бы эндпоинт в оракул
    для user-enumeration. Сам токен клиенту не отдаётся — он приходит
    только по email.
    """

    ok: bool = True
