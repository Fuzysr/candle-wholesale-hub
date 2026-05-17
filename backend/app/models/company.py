from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CompanySettings(Base):
    """Singleton row holding legal/bank details for the invoice template."""

    __tablename__ = "company_settings"
    __table_args__ = (CheckConstraint("id = 1", name="singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, server_default=text("1"))
    legal_name: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'ООО «CANDWAX»'"))
    short_name: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'CANDWAX'"))
    inn: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    kpp: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    ogrn: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    legal_address: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    postal_address: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    bank_name: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    bank_bik: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    bank_account: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    corr_account: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    director_name: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    director_position: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'Генеральный директор'")
    )
    phone: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    email: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    offer_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text(
            "'Настоящий счёт-договор является публичной офертой. "
            "Оплата счёта означает согласие с условиями поставки.'"
        ),
    )
    payment_terms: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text(
            "'Оплата по безналичному расчёту в течение 3 банковских дней с момента выставления счёта.'"
        ),
    )
    delivery_terms: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'Самовывоз со склада в Москве. Адрес и часы выдачи менеджер пришлёт вместе со счётом.'"),
    )
    signature_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    stamp_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
