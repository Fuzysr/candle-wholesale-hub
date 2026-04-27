"""Lightweight async email sender using stdlib smtplib.

Runs the blocking SMTP handshake inside ``asyncio.to_thread`` so it never
stalls the event loop.  If SMTP is not configured (``smtp_host`` is empty),
``send_email`` raises ``RuntimeError`` immediately.

Security notes
--------------
* All header values (``From``, ``To``, ``Subject``) are stripped of CR/LF
  before being set on the MIME object to prevent header-injection attacks
  (a malicious ``\\r\\n`` inside ``Subject`` could otherwise inject extra
  headers or even a second message).
* stdlib ``email`` raises on such characters too, but we prefer an explicit
  sanitiser over implicit exceptions.
"""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)

# Absolute ceiling to keep SMTP traffic predictable; the API layer applies
# its own stricter pydantic limits on top.
_MAX_SUBJECT_LEN = 500
_MAX_BODY_LEN = 20_000

# Single socket timeout (seconds). SMTP providers usually respond in <1s;
# anything longer is almost certainly a hang.
_SMTP_TIMEOUT = 10


def _sanitize_header(value: str) -> str:
    """Strip CR/LF and surrounding whitespace — blocks header injection."""
    return value.replace("\r", " ").replace("\n", " ").strip()


async def send_email(
    to_email: str,
    subject: str,
    body: str,
    *,
    html: bool = False,
    html_body: str | None = None,
) -> None:
    """Send a single email via the configured SMTP server.

    Parameters
    ----------
    to_email, subject, body
        Обязательные. `body` трактуется либо как plain-text, либо как HTML
        в зависимости от флага `html`.
    html
        Устаревший флаг для отправки ТОЛЬКО HTML. Предпочтительно
        использовать `html_body` и передавать оба формата — это
        улучшает и UX (красивый вид), и доставляемость (большинство
        антиспам-фильтров штрафуют письма без plain-части).
    html_body
        HTML-версия письма. Если передана, отправляется
        `multipart/alternative` с обеими частями — plain-часть берётся
        из `body` и используется как fallback для клиентов без HTML.
    """
    if not settings.smtp_host:
        raise RuntimeError("SMTP is not configured — set SMTP_HOST in .env")

    safe_to = _sanitize_header(to_email)
    safe_subject = _sanitize_header(subject)[:_MAX_SUBJECT_LEN] or "(без темы)"
    safe_body = body[:_MAX_BODY_LEN]
    safe_html = html_body[:_MAX_BODY_LEN] if html_body else None

    msg = MIMEMultipart("alternative")
    from_name = _sanitize_header(settings.smtp_from_name)
    from_email = _sanitize_header(settings.smtp_from_email) or _sanitize_header(settings.smtp_user)
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = safe_to
    msg["Subject"] = safe_subject

    # RFC 2046: в multipart/alternative последняя часть считается
    # «предпочтительной» — поэтому plain прикрепляем первым, HTML
    # вторым. Почтовик сам выберет ту, которую умеет отрисовать.
    if safe_html is not None:
        msg.attach(MIMEText(safe_body, "plain", "utf-8"))
        msg.attach(MIMEText(safe_html, "html", "utf-8"))
    else:
        subtype = "html" if html else "plain"
        msg.attach(MIMEText(safe_body, subtype, "utf-8"))

    await asyncio.to_thread(_send_sync, msg)


def _send_sync(msg: MIMEMultipart) -> None:
    """Blocking SMTP send — meant to be called via ``asyncio.to_thread``."""
    server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=_SMTP_TIMEOUT)
    try:
        if settings.smtp_use_tls:
            server.ehlo()
            server.starttls()
            server.ehlo()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:  # noqa: BLE001 — best-effort cleanup
            logger.debug("SMTP quit failed", exc_info=True)
