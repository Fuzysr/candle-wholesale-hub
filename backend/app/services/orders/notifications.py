"""Email helpers used by order workflows."""

import logging

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import send_email
from app.core.email_templates import (
    EmailSender,
    order_status_label,
    render_order_status_changed_email,
)
from app.models.company import CompanySettings
from app.models.order import Order
from app.models.user import User

logger = logging.getLogger(__name__)
COMPANY_SETTINGS_ID = 1


async def send_email_safe(
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> None:
    try:
        await send_email(
            to_email=to_email,
            subject=subject,
            body=body,
            html_body=html_body,
        )
    except Exception:
        logger.exception("Background send_email failed (to=%s)", to_email)


def build_email_sender(company: CompanySettings | None) -> EmailSender:
    return EmailSender(
        company_name=company.short_name if company else "CANDWAX",
        phone=company.phone if company else "",
        email=company.email if company else "",
    )


async def resolve_order_email(session: AsyncSession, order: Order) -> str | None:
    if order.email:
        return order.email
    user = await session.get(User, order.user_id)
    return user.email if user else None


def queue_status_change_email(
    background_tasks: BackgroundTasks,
    *,
    to_email: str,
    order_number: str,
    new_status: str,
    comment: str | None,
    sender: EmailSender,
    customer_name: str | None,
) -> None:
    if not settings.smtp_host or not to_email:
        return
    plain_body, html_body = render_order_status_changed_email(
        order_number=order_number,
        new_status=new_status,
        comment=comment,
        sender=sender,
        customer_name=customer_name,
    )
    background_tasks.add_task(
        send_email_safe,
        to_email=to_email,
        subject=f"Заявка №{order_number}: {order_status_label(new_status)}",
        body=plain_body,
        html_body=html_body,
    )
