from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserOut


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    company_name: str | None = None
    contact_name: str | None = None
    phone: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshIn(BaseModel):
    refresh: str


class TokenPair(BaseModel):
    access: str
    refresh: str
    token_type: str = "bearer"


class AccessToken(BaseModel):
    access: str
    token_type: str = "bearer"


class LoginOut(TokenPair):
    user: UserOut


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str
    password: str = Field(min_length=6, max_length=128)


class PasswordResetRequestOut(BaseModel):
    """Response for `/auth/password/reset-request`.

    In production the reset link is sent via email and this endpoint returns
    only `ok: True`. For development (email infra not wired yet) we return the
    raw token so the client flow can still be tested end-to-end.
    """

    ok: bool = True
    # dev-only: filled when APP_ENV != "production"
    reset_token: str | None = None
