"""Orders API.

Business rules mirror what the old Supabase flow did on the client:

* server-side recomputation of `total_boxes`, `subtotal`, `discount_percent`,
  `discount_amount`, `total` from the incoming items + discount tiers
* `order_number` is reserved application-side from a singleton counter row
  under a `SELECT … FOR UPDATE` lock (see `_next_order_number`)
* status changes by admins are logged into `order_status_history`

Payment flow (MVP):
* admin approves → status `awaiting_payment`, email with bank details to client
* client uploads receipt → status `payment_review`, email notification to admin
* admin confirms payment → status `paid`

Price + stock integrity (#price-canonicalisation, #stock-reservation)
---------------------------------------------------------------------
* Price, pieces_per_box, sku, product_name and variant_label are taken from
  ``product_variants`` server-side. Any client-supplied values for those
  fields are silently discarded — accepting them would let a malicious
  client POST `unit_price=0.01` and order the entire warehouse for free.
* Variants for an order are loaded with ``SELECT … FOR UPDATE`` so two
  concurrent checkouts on the same variant cannot both pass the
  ``available = stock_boxes - reserved_boxes`` gate (would be a classic
  TOCTOU race that lets the warehouse be over-sold).
* Creating an order increments ``reserved_boxes``; cancelling/rejecting it
  decrements them back; marking ``shipped`` converts the reservation into a
  real ``stock_boxes`` decrement and writes a `StockMovement` row.
"""

import logging
import secrets
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, get_current_user, get_current_user_optional, require_admin
from app.api.pagination import PaginationParams, pagination_params
from app.core import storage
from app.core.config import settings as app_settings
from app.core.email_templates import (
    EmailSender,
    PaymentDetails,
    render_awaiting_payment_email,
    render_new_order_admin_email,
    render_order_contact_email,
    render_order_created_email,
    render_order_ready_email,
    render_order_rejected_email,
    render_receipt_uploaded_email,
)
from app.core.mime_sniff import detect_mime
from app.core.order_state_machine import assert_transition_allowed
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.models.company import CompanySettings
from app.models.enums import AppRole, OrderStatus
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.user import User
from app.schemas.order import (
    OrderCreate,
    OrderListOut,
    OrderOut,
    OrderQuoteIn,
    OrderQuoteOut,
    OrderUpdateAdmin,
)
from app.services.orders.inventory import (
    assert_stock_available as _assert_stock_available_canonical,
)
from app.services.orders.inventory import (
    release_reservation as _release_reservation,
)
from app.services.orders.inventory import (
    ship_reservation as _ship_reservation,
)
from app.services.orders.notifications import (
    COMPANY_SETTINGS_ID as _COMPANY_SETTINGS_ID,
)
from app.services.orders.notifications import (
    build_email_sender as _build_email_sender,
)
from app.services.orders.notifications import (
    queue_status_change_email as _queue_status_change_email,
)
from app.services.orders.notifications import (
    send_email_safe as _send_email_safe,
)
from app.services.orders.pricing import (
    compute_order_pricing as _compute_order_pricing,
)
from app.services.orders.pricing import (
    quantize_money as _q,
)
from app.services.orders.pricing import (
    resolve_canonical_items as _resolve_canonical_items,
)
from app.services.orders.receipts import (
    attach_presigned_receipt as _attach_presigned_receipt,
)
from app.services.orders.receipts import (
    attach_presigned_receipts as _attach_presigned_receipts,
)
from app.services.orders.receipts import (
    receipt_key_for as _receipt_key_for,
)
from app.services.orders.repository import (
    load_order as _load_order,
)
from app.services.orders.repository import (
    lock_order as _lock_order,
)
from app.services.orders.repository import (
    next_order_number as _next_order_number,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["orders"])

# ========================================================================
# Client: create order
# ========================================================================


@router.post("/orders/quote", response_model=OrderQuoteOut)
async def quote_order(
    payload: OrderQuoteIn,
    session: AsyncSession = Depends(db_session),
) -> OrderQuoteOut:
    """Return the exact server-side totals that order creation will use."""
    canonical = await _resolve_canonical_items(
        session,
        payload.items,
        payload.currency,
        lock_variants=False,
    )
    _assert_stock_available_canonical(canonical)
    (
        total_boxes,
        subtotal,
        discount_percent,
        discount_amount,
        total,
        _,
    ) = await _compute_order_pricing(session, canonical)
    return OrderQuoteOut(
        total_boxes=total_boxes,
        subtotal=float(subtotal),
        discount_percent=float(discount_percent),
        discount_amount=float(discount_amount),
        total=float(total),
    )


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreate,
    background_tasks: BackgroundTasks,
    user: User | None = Depends(get_current_user_optional),
    session: AsyncSession = Depends(db_session),
) -> Order:
    # Guest checkout: if no authenticated user, derive one from payload
    # contact info. Email + contact_name are required so the manager can
    # follow up; the auto-created account is "claimable" later via the
    # standard "Forgot password" flow.
    if user is None:
        guest_email = (payload.email or "").strip().lower()
        guest_name = (payload.contact_name or "").strip()
        if not guest_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="email is required for guest checkout",
            )
        if not guest_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="contact_name is required for guest checkout",
            )
        existing = await session.scalar(select(User.id).where(User.email == guest_email))
        if existing is not None:
            # An email address is not proof of account ownership. Never attach a
            # guest order to an existing user: the profile update below would
            # otherwise let anyone overwrite that user's contact information.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Аккаунт с таким email уже существует. Войдите в него, чтобы оформить заказ."
                ),
            )

        # Random unguessable password — guest must use "Forgot password"
        # to claim the account. Marked active so they receive emails.
        user = User(
            email=guest_email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role=AppRole.client,
            company_name=payload.company_name or None,
            contact_name=guest_name,
            phone=payload.phone or None,
            inn=payload.inn or None,
            is_active=True,
        )
        session.add(user)
        await session.flush()

    # Resolve every item against `product_variants` (FOR UPDATE) — this both
    # locks rows for the stock-availability check and ignores any tampered
    # `unit_price`/`pieces_per_box` coming from the client (#price-canonicalisation).
    canonical = await _resolve_canonical_items(session, payload.items, payload.currency)
    _assert_stock_available_canonical(canonical)

    (
        total_boxes,
        subtotal,
        discount_percent,
        discount_amount,
        total,
        line_totals,
    ) = await _compute_order_pricing(session, canonical)
    if payload.quoted_total is not None and _q(payload.quoted_total) != total:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=("Стоимость заказа изменилась. Обновите расчёт и подтвердите новую сумму."),
        )

    order = Order(
        order_number=await _next_order_number(session),
        user_id=user.id,
        currency=payload.currency,
        subtotal=subtotal,
        discount_percent=discount_percent,
        discount_amount=discount_amount,
        total=total,
        total_boxes=total_boxes,
        delivery_address=payload.delivery_address,
        delivery_date=payload.delivery_date,
        customer_comment=payload.customer_comment,
        company_name=payload.company_name or user.company_name,
        contact_name=payload.contact_name or user.contact_name,
        phone=payload.phone or user.phone,
        inn=payload.inn or user.inn,
        email=payload.email or user.email,
    )
    session.add(order)
    await session.flush()  # populate order.id via PK default

    for r, line_total in zip(canonical, line_totals, strict=True):
        session.add(
            OrderItem(
                order_id=order.id,
                variant_id=r["variant_id"],
                sku=r["sku"],
                product_name=r["product_name"],
                variant_label=r["variant_label"],
                pieces_per_box=r["pieces_per_box"],
                boxes=r["boxes"],
                unit_price=r["unit_price"],
                line_total=line_total,
            )
        )
        # Reserve boxes on the variant in the same transaction. The variant
        # row is already FOR-UPDATE-locked from `_resolve_canonical_items`,
        # so two concurrent checkouts cannot both succeed and over-sell.
        v = r.get("variant_obj")
        if v is not None:
            v.reserved_boxes = (v.reserved_boxes or 0) + r["boxes"]

    # Update profile snapshot so next checkout is pre-filled.
    if payload.company_name:
        user.company_name = payload.company_name
    if payload.contact_name:
        user.contact_name = payload.contact_name
    if payload.phone:
        user.phone = payload.phone
    if payload.inn:
        user.inn = payload.inn
    if payload.delivery_address:
        user.address = payload.delivery_address

    await session.commit()

    full = await _load_order(session, order.id)
    assert full is not None
    await _attach_presigned_receipt(full)

    # --- Письмо клиенту: «Заявка создана, ожидает подтверждения» ---
    # Отправляется в фоне, чтобы не задерживать ответ на checkout. Если
    # SMTP не настроен или email отсутствует, письмо просто не уходит.
    total_str = f"{float(full.total):,.2f}".replace(",", " ")
    to_email = full.email
    if not to_email:
        to_email = user.email
    if to_email and app_settings.smtp_host:
        company = await session.get(CompanySettings, _COMPANY_SETTINGS_ID)
        sender = _build_email_sender(company)
        plain_body, html_body = render_order_created_email(
            order_number=full.order_number,
            total=total_str,
            currency=full.currency,
            sender=sender,
            customer_name=full.contact_name,
        )
        background_tasks.add_task(
            _send_email_safe,
            to_email=to_email,
            subject=f"Заявка №{full.order_number} принята",
            body=plain_body,
            html_body=html_body,
        )

    # --- Письмо админам: «Поступила новая заявка» ---
    if app_settings.smtp_host:
        admin_rows = (
            await session.scalars(
                select(User).where(User.role == AppRole.admin, User.is_active.is_(True))
            )
        ).all()
        if admin_rows:
            admin_plain, admin_html = render_new_order_admin_email(
                order_number=full.order_number,
                total=total_str,
                currency=full.currency,
                total_boxes=full.total_boxes,
                company_name=full.company_name,
                contact_name=full.contact_name,
                phone=full.phone,
                email=full.email or user.email,
            )
            admin_subject = f"Новая заявка №{full.order_number}"
            for adm in admin_rows:
                background_tasks.add_task(
                    _send_email_safe,
                    to_email=adm.email,
                    subject=admin_subject,
                    body=admin_plain,
                    html_body=admin_html,
                )

    return full


# ========================================================================
# Client: my orders
# ========================================================================


@router.get("/orders", response_model=list[OrderListOut])
async def list_my_orders(
    user: User = Depends(get_current_user),
    p: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(db_session),
) -> list[Order]:
    res = await session.scalars(
        select(Order)
        .where(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
        .offset(p.offset)
        .limit(p.limit)
    )
    orders = list(res.all())
    await _attach_presigned_receipts(orders)
    return orders


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session),
) -> Order:
    order = await _load_order(session, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")
    if order.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    await _attach_presigned_receipt(order)
    return order


# ========================================================================
# Admin: list + status updates
# ========================================================================


@router.get(
    "/admin/orders",
    response_model=list[OrderListOut],
    dependencies=[Depends(require_admin)],
)
async def admin_list_orders(
    p: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(db_session),
) -> list[Order]:
    res = await session.scalars(
        select(Order).order_by(Order.created_at.desc()).offset(p.offset).limit(p.limit)
    )
    orders = list(res.all())
    await _attach_presigned_receipts(orders)
    return orders


@router.get(
    "/admin/orders/{order_id}",
    response_model=OrderOut,
    dependencies=[Depends(require_admin)],
)
async def admin_get_order(order_id: UUID, session: AsyncSession = Depends(db_session)) -> Order:
    order = await _load_order(session, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")
    await _attach_presigned_receipt(order)
    return order


@router.patch(
    "/admin/orders/{order_id}",
    response_model=OrderOut,
)
async def admin_update_order(
    order_id: UUID,
    payload: OrderUpdateAdmin,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(db_session),
) -> Order:
    order = await _lock_order(session, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    status_changed = payload.status is not None and payload.status != order.status
    if payload.status is not None:
        # Gate the transition through the canonical state machine BEFORE
        # touching stock. `assert_transition_allowed` raises 409 on an
        # illegal change (e.g. cancelled → paid, new → shipped), and
        # crucially this check runs before `_release_reservation` /
        # `_ship_reservation` — otherwise a refused PATCH would still
        # have leaked side-effects into the inventory ledger.
        assert_transition_allowed(order.status, payload.status)

        # Inventory side-effects on the now-validated transition.
        if payload.status == OrderStatus.cancelled and order.status != OrderStatus.cancelled:
            await _release_reservation(session, order)
        elif payload.status == OrderStatus.shipped and order.status != OrderStatus.shipped:
            await _ship_reservation(session, order)
        order.status = payload.status
    if payload.admin_comment is not None:
        order.admin_comment = payload.admin_comment

    if status_changed:
        session.add(
            OrderStatusHistory(
                order_id=order.id,
                status=order.status,
                comment=payload.admin_comment,
                changed_by=admin.id,
            )
        )

    # Snapshot до commit (commit инвалидирует ORM-атрибуты).
    new_status_value = order.status.value if status_changed else None
    snapshot_email = order.email
    snapshot_user_id = order.user_id
    snapshot_order_number = order.order_number
    snapshot_contact_name = order.contact_name
    snapshot_admin_comment = payload.admin_comment

    await session.commit()
    full = await _load_order(session, order.id)
    assert full is not None
    await _attach_presigned_receipt(full)

    # --- Письмо клиенту об изменении статуса ---
    # PATCH — generic эндпоинт: у статусов awaiting_payment / cancelled /
    # shipped есть свои отдельные кнопки в админке, которые отправляют
    # специализированные шаблоны. Здесь же отправляем универсальное
    # уведомление для любого изменения, включая «paid», «processing» и
    # т.п. — клиент должен узнавать о КАЖДОЙ смене статуса.
    if status_changed and new_status_value:
        to_email = snapshot_email
        if not to_email:
            user_obj = await session.get(User, snapshot_user_id)
            to_email = user_obj.email if user_obj else None
        if to_email:
            company = await session.get(CompanySettings, _COMPANY_SETTINGS_ID)
            _queue_status_change_email(
                background_tasks,
                to_email=to_email,
                order_number=snapshot_order_number,
                new_status=new_status_value,
                comment=snapshot_admin_comment,
                sender=_build_email_sender(company),
                customer_name=snapshot_contact_name,
            )

    return full


# ========================================================================
# Admin: contact the order's customer via email
# ========================================================================


class OrderContactIn(BaseModel):
    """Payload for «связаться с клиентом по заявке».

    Note: the recipient address is **not** taken from the client. It is
    resolved server-side from the order row to prevent the endpoint from
    being abused as an open relay (e.g. if an admin token ever leaks).
    """

    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=10_000)


class OrderContactOut(BaseModel):
    ok: bool = True
    queued_to: str


@router.post(
    "/admin/orders/{order_id}/contact",
    response_model=OrderContactOut,
    dependencies=[Depends(require_admin)],
)
async def admin_contact_order_customer(
    order_id: UUID,
    payload: OrderContactIn,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(db_session),
) -> OrderContactOut:
    """Queue an email to the customer attached to `order_id`.

    The endpoint returns immediately (202-like semantics via BackgroundTasks)
    so the admin UI never blocks on the SMTP handshake. Actual delivery
    failures are logged; the admin will not see them in real time — which
    is the right trade-off for latency-sensitive UX.
    """
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    # Prefer the snapshot stored with the order; fall back to the user's
    # current profile email so orders created before email snapshots still
    # work. `User` is not eagerly loaded here because we only need `.email`.
    to_email = order.email
    if not to_email:
        user = await session.get(User, order.user_id)
        to_email = user.email if user else None

    if not to_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="у клиента не указан email",
        )

    # Fail fast if SMTP is not configured — avoids silently losing the
    # message in the background task.
    from app.core.config import settings as _s

    if not _s.smtp_host:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP не настроен на сервере",
        )

    # Build branded HTML + plain-text from the company settings singleton.
    company = await session.get(CompanySettings, _COMPANY_SETTINGS_ID)
    sender = EmailSender(
        company_name=company.short_name if company else "CANDWAX",
        phone=company.phone if company else "",
        email=company.email if company else "",
    )
    plain_body, html_body = render_order_contact_email(
        message=payload.body,
        order_number=order.order_number,
        subject=payload.subject,
        sender=sender,
        customer_name=order.contact_name,
    )

    background_tasks.add_task(
        _send_email_safe,
        to_email=to_email,
        subject=payload.subject,
        body=plain_body,
        html_body=html_body,
    )
    return OrderContactOut(queued_to=to_email)


# ========================================================================
# Admin: approve order → awaiting_payment (sends email with bank details)
# ========================================================================


class ApproveOut(BaseModel):
    ok: bool = True
    new_status: str


@router.post(
    "/admin/orders/{order_id}/approve",
    response_model=ApproveOut,
)
async def admin_approve_order(
    order_id: UUID,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(db_session),
) -> ApproveOut:
    """Одобрить заявку и перевести в статус «ожидает оплаты».

    Отправляет клиенту email с суммой и банковскими реквизитами компании.
    Допустимые исходные статусы: new, processing.
    """
    order = await _lock_order(session, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    assert_transition_allowed(order.status, OrderStatus.awaiting_payment)

    # Named transition endpoints are idempotent. This matters when a client
    # retries after a timeout or two operators click at once: the row lock
    # serialises both requests and the later one becomes a side-effect-free
    # success instead of duplicating history/email work.
    if order.status == OrderStatus.awaiting_payment:
        return ApproveOut(new_status=OrderStatus.awaiting_payment.value)

    order.status = OrderStatus.awaiting_payment
    session.add(
        OrderStatusHistory(
            order_id=order.id,
            status=OrderStatus.awaiting_payment,
            comment="Заявка одобрена — ожидаем оплату",
            changed_by=admin.id,
        )
    )
    await session.commit()

    # --- Send email with payment details ---
    to_email = order.email
    if not to_email:
        user = await session.get(User, order.user_id)
        to_email = user.email if user else None

    company = await session.get(CompanySettings, _COMPANY_SETTINGS_ID)
    if to_email and company and app_settings.smtp_host:
        sender = EmailSender(
            company_name=company.short_name if company else "CANDWAX",
            phone=company.phone if company else "",
            email=company.email if company else "",
        )
        payment = PaymentDetails(
            total=f"{float(order.total):,.2f}".replace(",", " "),
            currency=order.currency,
            bank_name=company.bank_name,
            bank_account=company.bank_account,
            bank_bik=company.bank_bik,
            corr_account=company.corr_account,
            legal_name=company.legal_name,
            inn=company.inn,
            kpp=company.kpp,
        )
        plain_body, html_body = render_awaiting_payment_email(
            order_number=order.order_number,
            payment=payment,
            sender=sender,
            customer_name=order.contact_name,
        )
        subject = f"Заявка №{order.order_number} одобрена — ожидаем оплату"
        background_tasks.add_task(
            _send_email_safe,
            to_email=to_email,
            subject=subject,
            body=plain_body,
            html_body=html_body,
        )

    return ApproveOut(new_status=OrderStatus.awaiting_payment.value)


# ========================================================================
# Admin: reject order → cancelled (sends email with reason to client)
# ========================================================================


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class RejectOut(BaseModel):
    ok: bool = True
    new_status: str


@router.post(
    "/admin/orders/{order_id}/reject",
    response_model=RejectOut,
)
async def admin_reject_order(
    order_id: UUID,
    payload: RejectIn,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(db_session),
) -> RejectOut:
    """Отклонить заявку с указанием причины → статус `cancelled`.

    Клиенту отправляется email с причиной отказа.
    Допустимые исходные статусы: все, кроме cancelled и completed.
    """
    order = await _lock_order(session, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    assert_transition_allowed(order.status, OrderStatus.cancelled)

    if order.status == OrderStatus.cancelled:
        return RejectOut(new_status=OrderStatus.cancelled.value)

    # Snapshot fields before commit (commit expires ORM attributes).
    to_email = order.email
    order_number = order.order_number
    contact_name = order.contact_name
    user_id = order.user_id

    order.status = OrderStatus.cancelled
    order.admin_comment = payload.reason
    # Free up the reserved boxes so other customers can buy them.
    await _release_reservation(session, order)
    session.add(
        OrderStatusHistory(
            order_id=order.id,
            status=OrderStatus.cancelled,
            comment=payload.reason,
            changed_by=admin.id,
        )
    )
    await session.commit()

    # --- Send rejection email to client ---
    if not to_email:
        user = await session.get(User, user_id)
        to_email = user.email if user else None

    company = await session.get(CompanySettings, _COMPANY_SETTINGS_ID)
    if to_email and app_settings.smtp_host:
        sender = EmailSender(
            company_name=company.short_name if company else "CANDWAX",
            phone=company.phone if company else "",
            email=company.email if company else "",
        )
        plain_body, html_body = render_order_rejected_email(
            order_number=order_number,
            reason=payload.reason,
            sender=sender,
            customer_name=contact_name,
        )
        subject = f"Заявка №{order_number} отклонена"
        background_tasks.add_task(
            _send_email_safe,
            to_email=to_email,
            subject=subject,
            body=plain_body,
            html_body=html_body,
        )

    return RejectOut(new_status=OrderStatus.cancelled.value)


# ========================================================================
# Client: upload payment receipt
# ========================================================================

_ALLOWED_RECEIPT_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"}
)


class ReceiptUploadOut(BaseModel):
    ok: bool = True
    receipt_url: str
    new_status: str


RECEIPT_UPLOAD_LIMIT = "10/minute"


@router.post(
    "/orders/{order_id}/receipt",
    response_model=ReceiptUploadOut,
)
@limiter.limit(RECEIPT_UPLOAD_LIMIT)
async def upload_payment_receipt(
    request: Request,
    order_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session),
) -> ReceiptUploadOut:
    """Клиент загружает скриншот/фото чека оплаты.

    Статус заявки меняется на `payment_review`. Файл сохраняется в приватную
    категорию локального хранилища `payment-receipts` (не отдаётся статикой).
    Админам отправляется email-уведомление.

    Ограничения безопасности:
    * Только владелец заявки может загружать чек
    * Допустимые статусы: awaiting_payment (может перезагрузить из payment_review)
    * Content-type: JPEG/PNG/WebP/AVIF/PDF
    * Размер ≤ UPLOAD_MAX_BYTES (5 МБ)
    """
    order = await _lock_order(session, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")
    if order.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    allowed_from = {OrderStatus.awaiting_payment, OrderStatus.payment_review}
    if order.status not in allowed_from:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="загрузка чека доступна только для заявок в статусе «ожидает оплаты»",
        )

    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_RECEIPT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"недопустимый тип файла: {content_type or 'unknown'}",
        )

    body = await file.read()
    if len(body) > app_settings.upload_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"файл слишком большой (> {app_settings.upload_max_bytes} байт)",
        )
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="пустой файл")

    # Magic-byte sniffing (#M1): content_type is client-controlled.
    # Without this check a polyglot HTML/JS disguised as image/jpeg
    # would land in the bucket and become a stored-XSS vector if
    # the presigned URL is ever opened in a browser.
    detected = detect_mime(body)
    if detected is None or detected not in _ALLOWED_RECEIPT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="содержимое файла не соответствует допустимому формату",
        )
    if detected != content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"заявленный тип {content_type} не совпадает с реальным содержимым ({detected})"
            ),
        )

    # If the client is re-uploading (status = payment_review) we have an
    # earlier object key in the bucket. Schedule its deletion AFTER the new
    # upload succeeds — best-effort, swallow any 4xx/5xx because the new
    # row already overrides the pointer in the database. We capture the
    # previous key BEFORE we mutate the model.
    previous_key = _receipt_key_for(order)

    key = storage.generate_key(file.filename or "receipt")
    # **Private** upload: stored under the receipts category, which is NOT
    # served by StaticFiles. Browsers must use the signed receipt URL we mint
    # on the response and on every subsequent GET.
    await storage.upload_bytes(
        app_settings.storage_category_receipts,
        key,
        body,
        content_type,
        public_read=False,
    )

    # Store the canonical object key only. Clear any legacy public URL so
    # `_attach_presigned_receipt` always uses the new path.
    order.payment_receipt_key = key
    order.payment_receipt_url = None
    order.status = OrderStatus.payment_review
    session.add(
        OrderStatusHistory(
            order_id=order.id,
            status=OrderStatus.payment_review,
            comment="Клиент загрузил чек оплаты",
            changed_by=user.id,
        )
    )
    await session.commit()

    if previous_key and previous_key != key:
        # Best-effort cleanup of the previous object so the bucket doesn't
        # accumulate orphaned receipts on re-uploads.
        try:
            await storage.delete_object(app_settings.storage_category_receipts, previous_key)
        except Exception:
            logger.exception("failed to delete previous receipt object %s", previous_key)

    # --- Notify admin(s) via email ---
    # IMPORTANT: we deliberately do NOT include any direct/presigned URL in
    # the email — see `render_receipt_uploaded_email` docstring.
    if app_settings.smtp_host:
        admin_rows = (
            await session.scalars(
                select(User).where(User.role == AppRole.admin, User.is_active.is_(True))
            )
        ).all()
        plain_body, html_body = render_receipt_uploaded_email(
            order_number=order.order_number,
            company_name=order.company_name,
            contact_name=order.contact_name,
        )
        subject = f"Чек по заявке №{order.order_number}"
        for adm in admin_rows:
            background_tasks.add_task(
                _send_email_safe,
                to_email=adm.email,
                subject=subject,
                body=plain_body,
                html_body=html_body,
            )

        # --- И клиенту: подтверждение, что чек получен и заявка ушла на проверку ---
        # Клиент сам инициировал действие, но письмо нужно для аудит-trail
        # и чтобы он видел в почте полную хронологию статусов заявки.
        client_email = order.email or user.email
        if client_email:
            company = await session.get(CompanySettings, _COMPANY_SETTINGS_ID)
            _queue_status_change_email(
                background_tasks,
                to_email=client_email,
                order_number=order.order_number,
                new_status=OrderStatus.payment_review.value,
                comment="Чек получен, заявка передана на проверку оплаты",
                sender=_build_email_sender(company),
                customer_name=order.contact_name,
            )

    return ReceiptUploadOut(
        receipt_url=storage.signed_receipt_url(str(order.id)),
        new_status=OrderStatus.payment_review.value,
    )


# ========================================================================
# Serve a payment receipt file (signed, capability-based)
# ========================================================================

# Map the stored file extension back to a content type for the response. Only
# the formats the upload endpoint accepts can ever appear here.
_RECEIPT_CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "avif": "image/avif",
    "pdf": "application/pdf",
}


@router.get("/orders/{order_id}/receipt-file")
async def get_receipt_file(
    order_id: UUID,
    exp: int,
    sig: str,
    session: AsyncSession = Depends(db_session),
) -> Response:
    """Serve a payment receipt to anyone holding a valid signed URL.

    Authentication is the signed capability token in the query string (see
    ``storage.signed_receipt_url``), mirroring the old S3 presigned URL: the
    browser loads this as a plain ``<img src>`` / ``<a href>`` and sends no
    Authorization header, so the token *is* the access control. The token is
    bound to this order id and a short expiry; an expired or tampered token is
    rejected with 403.
    """
    if not storage.verify_receipt_token(str(order_id), exp, sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid or expired link")

    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    key = _receipt_key_for(order)
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no receipt on file")

    data = await storage.read_object(app_settings.storage_category_receipts, key)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="receipt file missing")

    ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
    content_type = _RECEIPT_CONTENT_TYPES.get(ext, "application/octet-stream")
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=0, no-store"},
    )


# ========================================================================
# Admin: confirm payment
# ========================================================================


class ConfirmPaymentOut(BaseModel):
    ok: bool = True
    new_status: str


@router.post(
    "/admin/orders/{order_id}/confirm-payment",
    response_model=ConfirmPaymentOut,
)
async def admin_confirm_payment(
    order_id: UUID,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(db_session),
) -> ConfirmPaymentOut:
    """Админ подтверждает получение оплаты → статус `paid`.

    Допустимый исходный статус: payment_review.
    Клиенту отправляется письмо «Оплата подтверждена».
    """
    order = await _lock_order(session, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    assert_transition_allowed(order.status, OrderStatus.paid)

    if order.status == OrderStatus.paid:
        return ConfirmPaymentOut(new_status=OrderStatus.paid.value)

    # Snapshot до commit.
    snapshot_email = order.email
    snapshot_user_id = order.user_id
    snapshot_order_number = order.order_number
    snapshot_contact_name = order.contact_name

    order.status = OrderStatus.paid
    session.add(
        OrderStatusHistory(
            order_id=order.id,
            status=OrderStatus.paid,
            comment="Оплата подтверждена администратором",
            changed_by=admin.id,
        )
    )
    await session.commit()

    # --- Письмо клиенту: «Оплата подтверждена» ---
    to_email = snapshot_email
    if not to_email:
        user_obj = await session.get(User, snapshot_user_id)
        to_email = user_obj.email if user_obj else None
    if to_email:
        company = await session.get(CompanySettings, _COMPANY_SETTINGS_ID)
        _queue_status_change_email(
            background_tasks,
            to_email=to_email,
            order_number=snapshot_order_number,
            new_status=OrderStatus.paid.value,
            comment="Оплата подтверждена администратором",
            sender=_build_email_sender(company),
            customer_name=snapshot_contact_name,
        )

    return ConfirmPaymentOut(new_status=OrderStatus.paid.value)


# ========================================================================
# Admin: mark order as ready (assembled) → shipped + email to client
# ========================================================================


class MarkReadyOut(BaseModel):
    ok: bool = True
    new_status: str


@router.post(
    "/admin/orders/{order_id}/mark-ready",
    response_model=MarkReadyOut,
)
async def admin_mark_ready(
    order_id: UUID,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(db_session),
) -> MarkReadyOut:
    """Заказ собран и готов к выдаче → статус `shipped`.

    Клиенту отправляется email «Заказ собран — можете забирать».
    Допустимый исходный статус: paid.
    """
    order = await _lock_order(session, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    assert_transition_allowed(order.status, OrderStatus.shipped)

    if order.status == OrderStatus.shipped:
        return MarkReadyOut(new_status=OrderStatus.shipped.value)

    order.status = OrderStatus.shipped
    # Convert the reservation into a real stock decrement and write a
    # StockMovement audit row.
    await _ship_reservation(session, order)
    session.add(
        OrderStatusHistory(
            order_id=order.id,
            status=OrderStatus.shipped,
            comment="Заказ собран и готов к выдаче",
            changed_by=admin.id,
        )
    )
    await session.commit()

    # --- Send email to client ---
    to_email = order.email
    if not to_email:
        user = await session.get(User, order.user_id)
        to_email = user.email if user else None

    company = await session.get(CompanySettings, _COMPANY_SETTINGS_ID)
    if to_email and app_settings.smtp_host:
        sender = EmailSender(
            company_name=company.short_name if company else "CANDWAX",
            phone=company.phone if company else "",
            email=company.email if company else "",
        )
        plain_body, html_body = render_order_ready_email(
            order_number=order.order_number,
            sender=sender,
            customer_name=order.contact_name,
        )
        subject = f"Заказ №{order.order_number} собран — можете забирать"
        background_tasks.add_task(
            _send_email_safe,
            to_email=to_email,
            subject=subject,
            body=plain_body,
            html_body=html_body,
        )

    return MarkReadyOut(new_status=OrderStatus.shipped.value)
