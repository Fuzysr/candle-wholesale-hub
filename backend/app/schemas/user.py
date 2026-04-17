from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import AppRole


class UserBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    role: AppRole
    company_name: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    inn: str | None = None
    address: str | None = None
    is_active: bool
    created_at: datetime


class UserOut(UserBase):
    """Public representation of a user returned by /auth/me etc."""

    is_admin: bool


class ProfileUpdateIn(BaseModel):
    company_name: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    inn: str | None = None
    address: str | None = None
