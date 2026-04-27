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


class LogoutIn(BaseModel):
    """То же поле, что и в RefreshIn: предъявить refresh для отзыва.

    Логаут именно по refresh-токену, а не по access: access короткоживущий
    и ставить его в чёрный список в реестре дороже, чем дождаться TTL.
    Refresh — длинный, его реальная отзываемость и есть основной выигрыш
    реестра.
    """

    refresh: str


class TokenPair(BaseModel):
    access: str
    refresh: str
    token_type: str = "bearer"


class AccessToken(BaseModel):
    access: str
    token_type: str = "bearer"


class RefreshOut(TokenPair):
    """Ответ ``/auth/refresh``: новые access **и** refresh.

    После rotation предыдущий refresh инвалидирован — клиент обязан
    положить себе новый, иначе следующий refresh-обмен провалится.
    """


class LoginOut(TokenPair):
    user: UserOut


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str
    password: str = Field(min_length=6, max_length=128)


class PasswordResetRequestOut(BaseModel):
    """Ответ на `/auth/password/reset-request`.

    Сознательно не раскрывает, найден ли пользователь по email: любая
    дополнительная информация здесь превратила бы эндпоинт в оракул
    для user-enumeration. Сам токен клиенту не отдаётся — он приходит
    только по email.
    """

    ok: bool = True
