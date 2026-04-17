from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime
from sqlalchemy import Enum as SAEnum
from sqlalchemy import String, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import AppRole

if TYPE_CHECKING:
    from app.models.order import Order, OrderStatusHistory
    from app.models.stock import StockMovement


class User(Base):
    """Unified user table — replaces Supabase `auth.users` + `profiles` + `user_roles`.

    Role model is intentionally a single enum column (the frontend only ever
    distinguishes admin vs. non-admin). Can be upgraded to a many-to-many table
    later without breaking the API contract.
    """

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[AppRole] = mapped_column(
        SAEnum(AppRole, name="app_role", create_type=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        server_default=text("'client'"),
    )

    # Profile fields (previously in `profiles`)
    company_name: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    inn: Mapped[str | None] = mapped_column(String, nullable=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    orders: Mapped[list["Order"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    status_changes: Mapped[list["OrderStatusHistory"]] = relationship(back_populates="changed_by_user")
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="created_by_user")

    @property
    def is_admin(self) -> bool:
        return self.role == AppRole.admin
