"""Admin: generic send-email endpoint.

NOTE: For contacting a specific order's customer prefer
``POST /admin/orders/{order_id}/contact`` — the recipient is resolved
server-side from the order, so the endpoint cannot be used as an open
relay. This generic endpoint is kept for ad-hoc cases and should only be
used when there is no order to anchor the message to.
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.api.deps import require_admin
from app.core.config import settings
from app.core.email import send_email

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-email"])


class SendEmailIn(BaseModel):
    to_email: EmailStr
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=10_000)


class SendEmailOut(BaseModel):
    ok: bool = True
    queued_to: str


async def _send_email_safe(to_email: str, subject: str, body: str) -> None:
    """BackgroundTasks wrapper — swallows errors into the log."""
    try:
        await send_email(to_email=to_email, subject=subject, body=body)
    except Exception:
        logger.exception("Background send_email failed (to=%s)", to_email)


@router.post(
    "/admin/send-email",
    response_model=SendEmailOut,
    dependencies=[Depends(require_admin)],
)
async def admin_send_email(
    payload: SendEmailIn,
    background_tasks: BackgroundTasks,
) -> SendEmailOut:
    """Queue an email from the admin to an arbitrary address.

    Returns immediately; real SMTP delivery happens in a background task.
    """
    if not settings.smtp_host:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP не настроен на сервере",
        )

    background_tasks.add_task(
        _send_email_safe,
        to_email=payload.to_email,
        subject=payload.subject,
        body=payload.body,
    )
    return SendEmailOut(queued_to=payload.to_email)
