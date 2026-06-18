from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.types import GUID, TZDateTime


class ContactMessage(Base):
    """Submissions from the public «Написать нам» form."""

    __tablename__ = "contact_messages"

    id: Mapped[UUID] = mapped_column(
        GUID(),
        primary_key=True,
        default=uuid4,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(
        TZDateTime, server_default=func.now(), nullable=False
    )
