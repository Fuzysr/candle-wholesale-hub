"""Public contact-form endpoint.

Accepts name, phone, message from the site's «Написать нам» form.
Saves to DB always; additionally sends an email notification to the admin
if SMTP is configured.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, require_admin
from app.core.config import settings
from app.core.email import send_email
from app.core.rate_limit import limiter
from app.models.contact import ContactMessage

logger = logging.getLogger(__name__)

router = APIRouter(tags=["contact"])

CONTACT_LIMIT = "5/minute"


# ─── Schemas ───────────────────────────────────────────────────────────────────

class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(max_length=30, default="")
    message: str = Field(min_length=1, max_length=5000)


class ContactOut(BaseModel):
    ok: bool = True


class ContactMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    phone: str | None
    message: str
    is_read: bool
    created_at: str

# ─── Helpers ───────────────────────────────────────────────────────────────────

async def _send_contact_notification(name: str, phone: str, message: str) -> None:
    """Background task: email notification to admin."""
    admin_email = settings.smtp_from_email or settings.smtp_user
    if not admin_email:
        logger.warning("Contact form: no admin email configured, skipping notification")
        return

    subject = f"Новая заявка с сайта от {name}"
    body = (
        f"Имя: {name}\n"
        f"Телефон: {phone or '—'}\n"
        f"Сообщение:\n{message}"
    )
    try:
        await send_email(to_email=admin_email, subject=subject, body=body)
    except Exception:
        logger.exception("Failed to send contact form notification")


# ─── Public endpoint ───────────────────────────────────────────────────────────

@router.post("/contact", response_model=ContactOut)
@limiter.limit(CONTACT_LIMIT)
async def submit_contact_form(
    request: Request,  # noqa: ARG001 — required by slowapi
    payload: ContactIn,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(db_session),
) -> ContactOut:
    """Accept a contact-form submission. Saves to DB + queues email if SMTP is set."""
    msg = ContactMessage(
        name=payload.name,
        phone=payload.phone or None,
        message=payload.message,
    )
    session.add(msg)
    await session.commit()

    if settings.smtp_host:
        background_tasks.add_task(
            _send_contact_notification,
            name=payload.name,
            phone=payload.phone,
            message=payload.message,
        )

    return ContactOut()


# ─── Admin endpoints ───────────────────────────────────────────────────────────

@router.get(
    "/admin/contact-messages",
    response_model=list[ContactMessageOut],
    dependencies=[Depends(require_admin)],
)
async def list_contact_messages(
    session: AsyncSession = Depends(db_session),
) -> list[ContactMessageOut]:
    """List all contact-form submissions (newest first)."""
    result = await session.execute(
        select(ContactMessage).order_by(ContactMessage.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        ContactMessageOut(
            id=str(r.id),
            name=r.name,
            phone=r.phone,
            message=r.message,
            is_read=r.is_read,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.patch(
    "/admin/contact-messages/{message_id}/read",
    response_model=ContactOut,
    dependencies=[Depends(require_admin)],
)
async def mark_message_read(
    message_id: UUID,
    session: AsyncSession = Depends(db_session),
) -> ContactOut:
    """Mark a contact message as read."""
    await session.execute(
        update(ContactMessage)
        .where(ContactMessage.id == message_id)
        .values(is_read=True)
    )
    await session.commit()
    return ContactOut()


@router.delete(
    "/admin/contact-messages/{message_id}",
    response_model=ContactOut,
    dependencies=[Depends(require_admin)],
)
async def delete_contact_message(
    message_id: UUID,
    session: AsyncSession = Depends(db_session),
) -> ContactOut:
    """Delete a contact message."""
    result = await session.execute(
        select(ContactMessage).where(ContactMessage.id == message_id)
    )
    msg = result.scalar_one_or_none()
    if msg:
        await session.delete(msg)
        await session.commit()
    return ContactOut()
