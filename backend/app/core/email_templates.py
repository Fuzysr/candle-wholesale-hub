"""HTML + plain-text templates for outgoing emails.

Design choices
--------------
* **Inline CSS only** — Gmail, Outlook и Yandex вырезают или игнорируют
  `<style>` в `<head>`. Стили пишем прямо в `style="..."` на каждом теге.
* **Table-based layout** — классический «email-safe» подход. Современные
  клиенты умеют flex/grid, но Outlook на Windows до сих пор использует
  движок Word и ломает любой современный CSS. Таблицы рендерятся везде
  одинаково.
* **Plain-text fallback обязателен** — письма без `text/plain` части
  антиспам-фильтры (особенно Gmail) часто помечают как спам. Поэтому
  всегда отдаём обе части через `multipart/alternative`.
* **Вся пользовательская строка проходит через `html.escape`** —
  админ в поле «Сообщение» может случайно вставить `<` / `&` / `"`,
  это не должно ломать вёрстку и не должно превращаться в HTML-
  инъекцию на стороне почтового клиента получателя.

Payment flow templates
----------------------
* ``render_awaiting_payment_email`` — клиенту при одобрении заявки
  (статус awaiting_payment). Содержит сумму и реквизиты для оплаты.
* ``render_receipt_uploaded_email`` — админу, когда клиент загрузил чек
  (статус payment_review). Содержит ссылку на чек и номер заявки.
* ``render_order_ready_email`` — клиенту, когда заказ собран и готов
  к выдаче (статус shipped). Содержит номер заявки и контакты.
"""

from __future__ import annotations

import html
from dataclasses import dataclass


# Тёплая «свечная» палитра — тёмный амбра для шапки, кремовый фон
# конверта, акцент — янтарный. Выбрана так, чтобы хорошо смотреться
# и в светлой, и в тёмной теме Gmail/Yandex (они просто инвертируют).
_COLOR_BG = "#f5f1ea"
_COLOR_CARD = "#ffffff"
_COLOR_HEADER = "#2a2418"
_COLOR_HEADER_TEXT = "#f5e9d3"
_COLOR_HEADER_MUTED = "#a89778"
_COLOR_TEXT = "#2a2418"
_COLOR_MUTED = "#8b7a5a"
_COLOR_DIVIDER = "#ede4d3"
_COLOR_LINK = "#a36b2a"


@dataclass(frozen=True, slots=True)
class EmailSender:
    """Информация об отправителе для подстановки в подвал письма.

    Все поля опциональные — если чего-то нет, соответствующая строка
    в подвале просто не отрисуется.
    """

    company_name: str = "Candle Wholesale"
    phone: str = ""
    email: str = ""


def render_order_contact_email(
    *,
    message: str,
    order_number: str,
    subject: str,
    sender: EmailSender,
    customer_name: str | None = None,
) -> tuple[str, str]:
    """Отрендерить письмо «связаться с клиентом по заявке».

    Возвращает кортеж `(plain_text, html)` — оба варианта прикрепляются
    к `multipart/alternative`, чтобы письмо отображалось красиво там,
    где HTML поддерживается, и читаемо — там, где нет (и у антиспам-
    фильтров тоже меньше претензий).
    """
    company = sender.company_name or "Candle Wholesale"
    greeting_suffix = f", {customer_name.strip()}" if customer_name and customer_name.strip() else ""

    plain = _render_plain(
        message=message,
        order_number=order_number,
        company=company,
        phone=sender.phone,
        email=sender.email,
        greeting_suffix=greeting_suffix,
    )
    html_body = _render_html(
        message=message,
        order_number=order_number,
        subject=subject,
        company=company,
        phone=sender.phone,
        email=sender.email,
        greeting_suffix=greeting_suffix,
    )
    return plain, html_body


def _render_plain(
    *,
    message: str,
    order_number: str,
    company: str,
    phone: str,
    email: str,
    greeting_suffix: str,
) -> str:
    """Plain-text версия для клиентов без HTML и для антиспам-фильтров."""
    footer_lines: list[str] = [f"С уважением, команда {company}"]
    if phone:
        footer_lines.append(f"Тел.: {phone}")
    if email:
        footer_lines.append(f"Email: {email}")
    footer = "\n".join(footer_lines)

    return (
        f"Здравствуйте{greeting_suffix}!\n"
        f"\n"
        f"{message.strip()}\n"
        f"\n"
        f"---\n"
        f"{footer}\n"
        f"\n"
        f"Это письмо отправлено в ответ на заявку №{order_number}.\n"
    )


def _render_html(
    *,
    message: str,
    order_number: str,
    subject: str,
    company: str,
    phone: str,
    email: str,
    greeting_suffix: str,
) -> str:
    """Собирает HTML-письмо с inline-стилями."""
    # Экранируем ВСЁ, что пришло извне — иначе админ в «Сообщении»
    # может случайно сломать вёрстку или (в худшем случае) внедрить
    # ссылку/скрипт, который увидит клиент.
    safe_message = html.escape(message.strip())
    safe_subject = html.escape(subject)
    safe_order = html.escape(order_number)
    safe_company = html.escape(company)
    safe_greeting = html.escape(greeting_suffix)

    # Подвал с контактами — рендерится построчно, только если значение
    # не пустое. Ссылки на tel: и mailto: помогают клиенту позвонить/
    # ответить в один клик с мобильного.
    contact_rows: list[str] = []
    if phone:
        safe_phone = html.escape(phone)
        contact_rows.append(
            f'<div style="margin-top:4px;font-size:13px;color:{_COLOR_MUTED};">'
            f'Тел.: <a href="tel:{safe_phone}" style="color:{_COLOR_LINK};text-decoration:none;">{safe_phone}</a>'
            f'</div>'
        )
    if email:
        safe_email = html.escape(email)
        contact_rows.append(
            f'<div style="margin-top:4px;font-size:13px;color:{_COLOR_MUTED};">'
            f'Email: <a href="mailto:{safe_email}" style="color:{_COLOR_LINK};text-decoration:none;">{safe_email}</a>'
            f'</div>'
        )
    contacts_html = "".join(contact_rows)

    # Preheader — это текст, который некоторые клиенты (Gmail, Apple Mail)
    # показывают рядом с темой в списке писем. Прячем его от визуального
    # рендера через inline-стили, но оставляем в DOM для превью.
    preheader = html.escape(f"Сообщение по заявке №{order_number}")

    return f"""\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{safe_subject}</title>
</head>
<body style="margin:0;padding:0;background:{_COLOR_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:{_COLOR_TEXT};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:{_COLOR_BG};mso-hide:all;">
    {preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_COLOR_BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:{_COLOR_CARD};border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(45,37,24,0.08);">
          <tr>
            <td style="background:{_COLOR_HEADER};padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color:{_COLOR_HEADER_TEXT};font-size:17px;font-weight:600;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    {safe_company}
                  </td>
                  <td align="right" style="color:{_COLOR_HEADER_MUTED};font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    Заявка №{safe_order}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 12px 32px;">
              <p style="margin:0;font-size:18px;font-weight:600;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Здравствуйте{safe_greeting}!
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 32px 32px;">
              <div style="font-size:16px;font-weight:500;line-height:1.7;color:{_COLOR_TEXT};white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">{safe_message}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:{_COLOR_DIVIDER};line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              <p style="margin:0;font-size:15px;font-weight:500;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                С уважением,<br />
                <strong>команда {safe_company}</strong>
              </p>
              {contacts_html}
            </td>
          </tr>
        </table>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:16px 32px;text-align:center;font-size:11px;color:{_COLOR_MUTED};line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
              Это письмо отправлено в ответ на вашу заявку №{safe_order}.<br />
              Если вы не оставляли заявку, проигнорируйте сообщение.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


# =====================================================================
# Payment flow templates
# =====================================================================


@dataclass(frozen=True, slots=True)
class PaymentDetails:
    """Реквизиты для оплаты, подставляемые в письмо клиенту."""

    total: str
    currency: str
    bank_name: str
    bank_account: str
    bank_bik: str
    corr_account: str
    legal_name: str
    inn: str
    kpp: str


def render_awaiting_payment_email(
    *,
    order_number: str,
    payment: PaymentDetails,
    sender: EmailSender,
    customer_name: str | None = None,
) -> tuple[str, str]:
    """Письмо клиенту: «Ваша заявка одобрена, ожидаем оплату».

    Содержит сумму к оплате и банковские реквизиты. Клиент должен
    оплатить и прикрепить скриншот чека в личном кабинете.

    Возвращает `(plain_text, html)`.
    """
    company = sender.company_name or "Candle Wholesale"
    greeting_suffix = f", {customer_name.strip()}" if customer_name and customer_name.strip() else ""

    plain = (
        f"Здравствуйте{greeting_suffix}!\n"
        f"\n"
        f"Ваша заявка №{order_number} одобрена.\n"
        f"Сумма к оплате: {payment.total} {payment.currency}\n"
        f"\n"
        f"Реквизиты для оплаты:\n"
        f"Получатель: {payment.legal_name}\n"
        f"ИНН: {payment.inn}\n"
        f"КПП: {payment.kpp}\n"
        f"Банк: {payment.bank_name}\n"
        f"Р/с: {payment.bank_account}\n"
        f"БИК: {payment.bank_bik}\n"
        f"Корр/с: {payment.corr_account}\n"
        f"\n"
        f"После оплаты, пожалуйста, прикрепите скриншот или фото чека "
        f"в личном кабинете — рядом с заявкой будет кнопка «Я оплатил».\n"
        f"\n"
        f"---\n"
        f"С уважением, команда {company}\n"
    )

    safe_order = html.escape(order_number)
    safe_company = html.escape(company)
    safe_greeting = html.escape(greeting_suffix)
    safe_total = html.escape(payment.total)
    safe_currency = html.escape(payment.currency)
    safe_legal = html.escape(payment.legal_name)
    safe_inn = html.escape(payment.inn)
    safe_kpp = html.escape(payment.kpp)
    safe_bank = html.escape(payment.bank_name)
    safe_account = html.escape(payment.bank_account)
    safe_bik = html.escape(payment.bank_bik)
    safe_corr = html.escape(payment.corr_account)

    subject = f"Заявка №{order_number} одобрена — ожидаем оплату"
    safe_subject = html.escape(subject)
    preheader = html.escape(f"Сумма к оплате: {payment.total} {payment.currency}")

    contacts_html = _render_contacts_html(sender)

    html_body = f"""\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{safe_subject}</title>
</head>
<body style="margin:0;padding:0;background:{_COLOR_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:{_COLOR_TEXT};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:{_COLOR_BG};mso-hide:all;">
    {preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_COLOR_BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:{_COLOR_CARD};border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(45,37,24,0.08);">
          <tr>
            <td style="background:{_COLOR_HEADER};padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color:{_COLOR_HEADER_TEXT};font-size:17px;font-weight:600;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    {safe_company}
                  </td>
                  <td align="right" style="color:{_COLOR_HEADER_MUTED};font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    Заявка №{safe_order}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 12px 32px;">
              <p style="margin:0;font-size:18px;font-weight:600;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Здравствуйте{safe_greeting}!
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px 32px;">
              <p style="margin:0 0 16px 0;font-size:16px;font-weight:500;line-height:1.7;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Ваша заявка <strong>№{safe_order}</strong> одобрена.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;border-radius:8px;border:1px solid {_COLOR_DIVIDER};">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:13px;color:{_COLOR_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      Сумма к оплате
                    </div>
                    <div style="margin-top:6px;font-size:28px;font-weight:700;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      {safe_total} {safe_currency}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <div style="font-size:13px;font-weight:600;color:{_COLOR_TEXT};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Реквизиты для оплаты
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.6;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                <tr><td style="padding:3px 0;color:{_COLOR_MUTED};width:120px;">Получатель</td><td style="padding:3px 0;font-weight:500;">{safe_legal}</td></tr>
                <tr><td style="padding:3px 0;color:{_COLOR_MUTED};">ИНН</td><td style="padding:3px 0;">{safe_inn}</td></tr>
                <tr><td style="padding:3px 0;color:{_COLOR_MUTED};">КПП</td><td style="padding:3px 0;">{safe_kpp}</td></tr>
                <tr><td style="padding:3px 0;color:{_COLOR_MUTED};">Банк</td><td style="padding:3px 0;">{safe_bank}</td></tr>
                <tr><td style="padding:3px 0;color:{_COLOR_MUTED};">Р/с</td><td style="padding:3px 0;">{safe_account}</td></tr>
                <tr><td style="padding:3px 0;color:{_COLOR_MUTED};">БИК</td><td style="padding:3px 0;">{safe_bik}</td></tr>
                <tr><td style="padding:3px 0;color:{_COLOR_MUTED};">Корр/с</td><td style="padding:3px 0;">{safe_corr}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef9ef;border-radius:8px;border:2px solid #e8b84b;">
                <tr>
                  <td style="padding:18px 22px;">
                    <div style="font-size:15px;font-weight:700;line-height:1.65;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      &#9888;&#65039; После оплаты, пожалуйста, прикрепите скриншот или фото чека
                      в личном кабинете &mdash; рядом с заявкой будет кнопка
                      <span style="display:inline-block;margin-top:4px;padding:4px 12px;background:#a36b2a;color:#ffffff;border-radius:4px;font-size:14px;font-weight:700;">Я оплатил</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:{_COLOR_DIVIDER};line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              <p style="margin:0;font-size:15px;font-weight:500;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                С уважением,<br />
                <strong>команда {safe_company}</strong>
              </p>
              {contacts_html}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return plain, html_body


def render_receipt_uploaded_email(
    *,
    order_number: str,
    company_name: str | None,
    contact_name: str | None,
) -> tuple[str, str]:
    """Письмо админу: «По заказу №X пришёл чек».

    Минимальное уведомление — plain + html. **Прямая ссылка на чек
    намеренно НЕ включается**: чек лежит в приватном бакете и доступен
    только через короткоживущий presigned URL, выдаваемый админ-панелью
    по запросу. Класть такой URL в исходящее письмо рискованно (PII в
    логах SMTP/MTA, и URL всё равно протухнет за 5 минут).

    Возвращает `(plain_text, html)`.
    """
    plain = (
        f"По заявке №{order_number} загружен чек оплаты.\n"
        f"Клиент: {company_name or '—'} ({contact_name or '—'})\n"
        f"\n"
        f"Откройте заявку в админ-панели, чтобы посмотреть чек "
        f"и подтвердить оплату.\n"
    )

    safe_order = html.escape(order_number)
    safe_company_name = html.escape(company_name or "—")
    safe_contact = html.escape(contact_name or "—")
    subject = f"Чек по заявке №{order_number}"
    safe_subject = html.escape(subject)

    html_body = f"""\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{safe_subject}</title>
</head>
<body style="margin:0;padding:0;background:{_COLOR_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:{_COLOR_TEXT};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_COLOR_BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:{_COLOR_CARD};border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(45,37,24,0.08);">
          <tr>
            <td style="background:{_COLOR_HEADER};padding:24px 32px;">
              <div style="color:{_COLOR_HEADER_TEXT};font-size:17px;font-weight:600;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Уведомление: чек загружен
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                По заявке <strong>№{safe_order}</strong> клиент загрузил чек оплаты.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.6;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                <tr><td style="padding:3px 0;color:{_COLOR_MUTED};width:100px;">Компания</td><td style="padding:3px 0;">{safe_company_name}</td></tr>
                <tr><td style="padding:3px 0;color:{_COLOR_MUTED};">Контакт</td><td style="padding:3px 0;">{safe_contact}</td></tr>
              </table>
              <p style="margin:16px 0 0 0;font-size:14px;color:{_COLOR_MUTED};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Откройте заявку в админ-панели, чтобы посмотреть чек
                и подтвердить оплату.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return plain, html_body


def render_order_ready_email(
    *,
    order_number: str,
    sender: EmailSender,
    customer_name: str | None = None,
) -> tuple[str, str]:
    """Письмо клиенту: «Заказ собран и готов к выдаче».

    Возвращает `(plain_text, html)`.
    """
    company = sender.company_name or "Candle Wholesale"
    greeting_suffix = f", {customer_name.strip()}" if customer_name and customer_name.strip() else ""

    plain = (
        f"Здравствуйте{greeting_suffix}!\n"
        f"\n"
        f"Ваш заказ №{order_number} собран и готов к выдаче.\n"
        f"Пожалуйста, свяжитесь с нами для уточнения времени и места получения.\n"
        f"\n"
        f"---\n"
        f"С уважением, команда {company}\n"
    )

    safe_order = html.escape(order_number)
    safe_company = html.escape(company)
    safe_greeting = html.escape(greeting_suffix)
    subject = f"Заказ №{order_number} собран — можете забирать"
    safe_subject = html.escape(subject)
    preheader = html.escape(f"Заказ №{order_number} готов к выдаче")

    contacts_html = _render_contacts_html(sender)

    html_body = f"""\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{safe_subject}</title>
</head>
<body style="margin:0;padding:0;background:{_COLOR_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:{_COLOR_TEXT};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:{_COLOR_BG};mso-hide:all;">
    {preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_COLOR_BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:{_COLOR_CARD};border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(45,37,24,0.08);">
          <tr>
            <td style="background:{_COLOR_HEADER};padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color:{_COLOR_HEADER_TEXT};font-size:17px;font-weight:600;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    {safe_company}
                  </td>
                  <td align="right" style="color:{_COLOR_HEADER_MUTED};font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    Заказ №{safe_order}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 12px 32px;">
              <p style="margin:0;font-size:18px;font-weight:600;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Здравствуйте{safe_greeting}!
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#edf7ed;border-radius:8px;border:1px solid #c3e6c3;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:18px;font-weight:700;color:#2e7d32;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      &#10003; Ваш заказ №{safe_order} собран и готов к выдаче!
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <p style="margin:0;font-size:16px;font-weight:500;line-height:1.7;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Пожалуйста, свяжитесь с нами для уточнения времени и места получения.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:{_COLOR_DIVIDER};line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              <p style="margin:0;font-size:15px;font-weight:500;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                С уважением,<br />
                <strong>команда {safe_company}</strong>
              </p>
              {contacts_html}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return plain, html_body


def render_order_rejected_email(
    *,
    order_number: str,
    reason: str,
    sender: EmailSender = EmailSender(),
    customer_name: str | None = None,
) -> tuple[str, str]:
    """Письмо клиенту об отклонении заявки с причиной от администратора."""
    safe_order = html.escape(order_number)
    safe_reason = html.escape(reason)
    safe_company = html.escape(sender.company_name)
    safe_greeting = f", {html.escape(customer_name)}" if customer_name else ""
    contacts_html = _render_contacts_html(sender)

    plain = (
        f"Здравствуйте{safe_greeting}!\n\n"
        f"К сожалению, ваша заявка №{safe_order} была отклонена.\n\n"
        f"Причина: {safe_reason}\n\n"
        f"Если у вас есть вопросы, свяжитесь с нами.\n\n"
        f"С уважением,\n"
        f"команда {safe_company}"
    )
    if sender.phone:
        plain += f"\nТел.: {sender.phone}"
    if sender.email:
        plain += f"\nEmail: {sender.email}"

    html_body = f"""\
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:{_COLOR_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_COLOR_BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:{_COLOR_CARD};border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:{_COLOR_HEADER};padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color:{_COLOR_HEADER_TEXT};font-size:17px;font-weight:600;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    {safe_company}
                  </td>
                  <td align="right" style="color:{_COLOR_HEADER_MUTED};font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    Заявка №{safe_order}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 12px 32px;">
              <p style="margin:0;font-size:18px;font-weight:600;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Здравствуйте{safe_greeting}!
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef2f2;border-radius:8px;border:2px solid #fca5a5;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:18px;font-weight:700;color:#dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      &#10007; Заявка №{safe_order} отклонена
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafaf9;border-radius:8px;border:1px solid {_COLOR_DIVIDER};">
                <tr>
                  <td style="padding:16px 20px;">
                    <div style="font-size:13px;font-weight:600;color:{_COLOR_MUTED};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      Причина
                    </div>
                    <div style="font-size:15px;font-weight:500;line-height:1.6;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      {safe_reason}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <p style="margin:0;font-size:16px;font-weight:500;line-height:1.7;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Если у вас есть вопросы, пожалуйста, свяжитесь с нами.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:{_COLOR_DIVIDER};line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              <p style="margin:0;font-size:15px;font-weight:500;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                С уважением,<br />
                <strong>команда {safe_company}</strong>
              </p>
              {contacts_html}
            </td>
          </tr>
        </table>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:16px 32px;text-align:center;font-size:11px;color:{_COLOR_MUTED};line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
              Это письмо отправлено в ответ на вашу заявку №{safe_order}.<br />
              Если вы не оставляли заявку, проигнорируйте сообщение.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return plain, html_body


def _render_contacts_html(sender: EmailSender) -> str:
    """Рендерит HTML-блок контактов для подвала письма."""
    rows: list[str] = []
    if sender.phone:
        safe_phone = html.escape(sender.phone)
        rows.append(
            f'<div style="margin-top:4px;font-size:13px;color:{_COLOR_MUTED};">'
            f'Тел.: <a href="tel:{safe_phone}" style="color:{_COLOR_LINK};text-decoration:none;">{safe_phone}</a>'
            f'</div>'
        )
    if sender.email:
        safe_email = html.escape(sender.email)
        rows.append(
            f'<div style="margin-top:4px;font-size:13px;color:{_COLOR_MUTED};">'
            f'Email: <a href="mailto:{safe_email}" style="color:{_COLOR_LINK};text-decoration:none;">{safe_email}</a>'
            f'</div>'
        )
    return "".join(rows)


# =====================================================================
# Password reset template
# =====================================================================


def render_password_reset_email(
    *,
    reset_url: str,
    ttl_minutes: int,
    sender: EmailSender = EmailSender(),
) -> tuple[str, str]:
    """Письмо пользователю со ссылкой для сброса пароля.

    Принципиально НЕ содержит ни старого, ни нового пароля — только
    временную ссылку. TTL (в минутах) явно указывается в тексте,
    чтобы пользователь понимал, что письмо протухнет и не стоит
    откладывать действие.

    Возвращает `(plain_text, html)` для `multipart/alternative`.
    """
    company = sender.company_name or "Candle Wholesale"
    safe_company = html.escape(company)
    safe_url = html.escape(reset_url, quote=True)
    safe_ttl = html.escape(str(ttl_minutes))
    contacts_html = _render_contacts_html(sender)

    subject = f"Сброс пароля в {company}"
    safe_subject = html.escape(subject)
    preheader = html.escape(
        f"Ссылка для смены пароля (действует {ttl_minutes} минут)"
    )

    plain = (
        f"Здравствуйте!\n"
        f"\n"
        f"Был получен запрос на смену пароля для вашего аккаунта в {company}.\n"
        f"Чтобы установить новый пароль, перейдите по ссылке ниже:\n"
        f"\n"
        f"{reset_url}\n"
        f"\n"
        f"Ссылка действительна в течение {ttl_minutes} минут.\n"
        f"Если вы не запрашивали смену пароля, просто проигнорируйте это письмо —\n"
        f"ваш текущий пароль останется без изменений.\n"
        f"\n"
        f"---\n"
        f"С уважением, команда {company}\n"
    )

    html_body = f"""\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{safe_subject}</title>
</head>
<body style="margin:0;padding:0;background:{_COLOR_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:{_COLOR_TEXT};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:{_COLOR_BG};mso-hide:all;">
    {preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_COLOR_BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:{_COLOR_CARD};border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(45,37,24,0.08);">
          <tr>
            <td style="background:{_COLOR_HEADER};padding:24px 32px;">
              <div style="color:{_COLOR_HEADER_TEXT};font-size:17px;font-weight:600;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                {safe_company}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Сброс пароля
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px 8px 32px;">
              <p style="margin:0;font-size:16px;font-weight:500;line-height:1.65;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Здравствуйте! Был получен запрос на смену пароля для вашего аккаунта.
              </p>
              <p style="margin:12px 0 0 0;font-size:16px;font-weight:500;line-height:1.65;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Чтобы установить новый пароль, нажмите кнопку ниже:
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 32px 8px 32px;">
              <!--
                Bulletproof button: в таблице-обёртке задаём фон, а внутри
                <a> с inline-стилями на padding — это рендерится во всех
                мыслимых клиентах, включая Outlook на движке Word.
              -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="{_COLOR_LINK}" style="border-radius:8px;background:{_COLOR_LINK};">
                    <a href="{safe_url}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      Сбросить пароль
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px 8px 32px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:{_COLOR_MUTED};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                Если кнопка не открывается, скопируйте ссылку в адресную строку браузера:
              </p>
              <p style="margin:6px 0 0 0;font-size:12px;line-height:1.5;color:{_COLOR_LINK};word-break:break-all;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                <a href="{safe_url}" target="_blank" style="color:{_COLOR_LINK};text-decoration:underline;">{safe_url}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef9ef;border-radius:8px;border:1px solid #e8b84b;">
                <tr>
                  <td style="padding:14px 18px;">
                    <div style="font-size:14px;font-weight:600;line-height:1.55;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      Ссылка действительна в течение <strong>{safe_ttl} минут</strong>.
                    </div>
                    <div style="margin-top:4px;font-size:13px;line-height:1.55;color:{_COLOR_MUTED};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                      Если вы не запрашивали смену пароля — просто проигнорируйте письмо,
                      текущий пароль останется прежним.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <div style="height:1px;background:{_COLOR_DIVIDER};line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 32px 32px;">
              <p style="margin:0;font-size:15px;font-weight:500;color:{_COLOR_TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                С уважением,<br />
                <strong>команда {safe_company}</strong>
              </p>
              {contacts_html}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return plain, html_body
