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
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import db_session, get_current_user, get_current_user_optional, require_admin
from app.core.security import hash_password
import secrets
from app.api.pagination import PaginationParams, pagination_params
from app.core import storage
from app.core.config import settings as app_settings
from app.core.mime_sniff import detect_mime
from app.core.rate_limit import limiter
from app.core.email import send_email
from app.core.email_templates import (
    EmailSender,
    PaymentDetails,
    render_awaiting_payment_email,
    render_new_order_admin_email,
    render_order_contact_email,
    render_order_created_email,
    render_order_ready_email,
    order_status_label,
    render_order_rejected_email,
    render_order_status_changed_email,
    render_receipt_uploaded_email,
)
from app.core.order_state_machine import assert_transition_allowed
from app.models.catalog import ProductVariant, VolumeDiscount
from app.models.company import CompanySettings
from app.models.enums import AppRole, OrderStatus, StockMovementType
from app.models.order import Order, OrderItem, OrderNumberCounter, OrderStatusHistory
from app.models.stock import DiscountTier, StockMovement
from app.models.user import User
from app.schemas.order import (
    OrderCreate,
    OrderItemIn,
    OrderListOut,
    OrderOut,
    OrderUpdateAdmin,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["orders"])

# Singleton row id + first number for the order-number counter. Mirrors the old
# PostgreSQL sequence (`CREATE SEQUENCE order_number_seq START 10000`).
_ORDER_COUNTER_ID = 1
_ORDER_NUMBER_START = 10000


async def _next_order_number(session: AsyncSession) -> str:
    """Reserve the next sequential order number inside the current transaction.

    Replaces the old PostgreSQL trigger + sequence. The singleton counter row
    is locked with ``SELECT … FOR UPDATE`` so two concurrent checkouts can't be
    handed the same number; this serialises order creation, which is fine at our
    volume. Must be called inside an open transaction that later commits — the
    lock (and the reserved value) are released/persisted with that commit.
    """
    counter = (
        await session.execute(
            select(OrderNumberCounter)
            .where(OrderNumberCounter.id == _ORDER_COUNTER_ID)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if counter is None:
        # Safety net for a DB that wasn't seeded (the migration/bootstrap seed
        # the row). First-ever order creates it; the PK makes a concurrent
        # double-insert fail loudly rather than duplicate a number.
        counter = OrderNumberCounter(id=_ORDER_COUNTER_ID, next_value=_ORDER_NUMBER_START)
        session.add(counter)
        await session.flush()
    value = counter.next_value
    counter.next_value = value + 1
    return f"CW-{value}"


def _q(value: Decimal | float | int | str) -> Decimal:
    """Round to 2 decimal places using banker-safe ROUND_HALF_UP.

    Money must never be float-arithmetic'd; we accept a few input types only
    so callers don't have to think about conversion.
    """
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _build_variant_label(v: ProductVariant) -> str | None:
    """Human-readable label for the order line snapshot.

    Mirrors the way the catalog UI labels SKUs: «size · color · shape» where
    available. Not security-critical (only used in invoice/UI), but keeping
    the snapshot canonical avoids client-supplied label drift.
    """
    parts = [p for p in (v.size, v.color, v.shape) if p]
    return " · ".join(parts) if parts else None


async def _resolve_canonical_items(
    session: AsyncSession,
    items: list[OrderItemIn],
    currency: str,
) -> list[dict]:
    """Resolve every item against ``product_variants`` server-side.

    For lines WITH ``variant_id`` we override sku / product_name / variant_label
    / pieces_per_box / unit_price from the DB so the client cannot tamper with
    pricing. Variants are locked with ``SELECT … FOR UPDATE`` so the
    subsequent stock check + reservation is race-free against concurrent
    checkouts on the same SKU (#stock-reservation).

    Lines WITHOUT ``variant_id`` (free-text rows from QuickOrder that didn't
    match an SKU) are passed through untouched — the manager reconciles them
    by hand later. They never affect inventory.
    """
    variant_ids = [i.variant_id for i in items if i.variant_id is not None]
    variants_by_id: dict[UUID, ProductVariant] = {}
    if variant_ids:
        rows = (
            await session.execute(
                select(ProductVariant)
                .options(
                    selectinload(ProductVariant.product),
                    selectinload(ProductVariant.volume_discounts),
                )
                .where(ProductVariant.id.in_(variant_ids))
                .with_for_update()
            )
        ).scalars().all()
        variants_by_id = {v.id: v for v in rows}

    canonical: list[dict] = []
    for item in items:
        if item.variant_id is None:
            canonical.append({
                "variant_id": None,
                "variant_obj": None,
                "sku": item.sku,
                "product_name": item.product_name,
                "variant_label": item.variant_label,
                "pieces_per_box": item.pieces_per_box,
                "boxes": item.boxes,
                "unit_price": _q(item.unit_price),
            })
            continue

        v = variants_by_id.get(item.variant_id)
        if v is None:
            # Variant disappeared between adding to cart and checkout. Mirror
            # the legacy 409 «out_of_stock» shape so the frontend keeps its
            # one-shot error path.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": f"Товар {item.sku} больше недоступен",
                    "out_of_stock": [{
                        "variant_id": str(item.variant_id),
                        "sku": item.sku,
                        "product_name": item.product_name,
                        "requested_boxes": item.boxes,
                        "available_boxes": 0,
                        "reason": "not_found",
                    }],
                },
            )

        unit = v.price_per_piece_rub if currency == "RUB" else v.price_per_piece_usd
        product_name = v.product.name_ru if v.product else item.product_name
        canonical.append({
            "variant_id": v.id,
            "variant_obj": v,
            "sku": v.sku,
            "product_name": product_name,
            "variant_label": _build_variant_label(v),
            "pieces_per_box": v.pieces_per_box,
            "boxes": item.boxes,
            "unit_price": _q(unit),
            "volume_discounts": list(v.volume_discounts),
        })
    return canonical


def _best_volume_discount(volume_discounts: list, boxes: int) -> Decimal:
    """Find the highest applicable per-variant volume discount percent."""
    best = Decimal("0")
    for vd in volume_discounts:
        if boxes >= vd.min_boxes:
            pct = Decimal(str(vd.discount_percent))
            if pct > best:
                best = pct
    return best


def _compute_totals_canonical(
    rows: list[dict],
) -> tuple[int, Decimal, Decimal, Decimal, Decimal, list[Decimal]]:
    """Return `(total_boxes, subtotal, discount_percent, discount_amount, total, line_totals)`
    in Decimal so money never round-trips through float.

    Each line applies its own per-variant volume discount independently.
    `discount_amount` is the sum of all per-line discounts; `discount_percent`
    is set to 0 (no global order-level discount).
    """
    line_totals: list[Decimal] = []
    total_boxes = 0
    subtotal_before = Decimal("0")
    subtotal_after = Decimal("0")
    for r in rows:
        line = _q(r["unit_price"] * Decimal(r["pieces_per_box"]) * Decimal(r["boxes"]))
        subtotal_before += line
        # Per-variant volume discount
        vd_list = r.get("volume_discounts", [])
        if vd_list:
            vd_pct = _best_volume_discount(vd_list, r["boxes"])
            if vd_pct > 0:
                line = _q(line * (Decimal("100") - vd_pct) / Decimal("100"))
        line_totals.append(line)
        total_boxes += r["boxes"]
        subtotal_after += line

    discount_amount = _q(subtotal_before - subtotal_after)
    return total_boxes, _q(subtotal_before), Decimal("0"), discount_amount, _q(subtotal_after), line_totals


async def _load_order(session: AsyncSession, order_id: UUID) -> Order | None:
    return await session.scalar(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )


# ---------------------------------------------------------------------------
# Receipt URL helpers (#receipt-private-storage)
# ---------------------------------------------------------------------------
#
# Receipts live in a **private** local-storage category (never served by
# StaticFiles). The Order ORM model carries the canonical
# `payment_receipt_key`; on every response we mint a short-lived **signed**
# URL pointing at the authenticated `/orders/{id}/receipt-file` endpoint, so
# the frontend can drop it straight into an `<img src>` / `<a href>` (which
# carry no auth header) yet leaked links expire quickly. `payment_receipt_url`
# is kept on the model only for legacy rows that stored a public URL directly.


def _receipt_key_for(order: Order) -> str | None:
    """Return the storage key for ``order``'s receipt, if any.

    Falls back to parsing the legacy ``payment_receipt_url`` so receipts
    uploaded before the migration are still serveable.
    """
    if order.payment_receipt_key:
        return order.payment_receipt_key
    legacy = order.payment_receipt_url
    if not legacy:
        return None
    parsed = storage.parse_public_url(
        legacy, categories=[app_settings.storage_category_receipts]
    )
    return parsed[1] if parsed else None


async def _attach_presigned_receipt(order: Order) -> None:
    """Replace ``order.payment_receipt_url`` in place with a signed URL.

    The mutation is intentionally on the ORM instance: FastAPI's response
    serializer reads the attribute via `from_attributes=True`. Because we
    never flush/commit after this point in the request lifecycle, the
    write does not propagate to the database.
    """
    key = _receipt_key_for(order)
    if not key:
        # Either no receipt at all, or a legacy URL we can no longer
        # match — clear the field so the frontend doesn't render a
        # broken link.
        order.payment_receipt_url = None
        return
    order.payment_receipt_url = storage.signed_receipt_url(str(order.id))


async def _attach_presigned_receipts(orders: list[Order]) -> None:
    for o in orders:
        await _attach_presigned_receipt(o)


def _assert_stock_available_canonical(rows: list[dict]) -> None:
    """Reject the order if any canonical line asks for more boxes than
    `stock_boxes - reserved_boxes` on the (already FOR-UPDATE-locked) variant.

    Reports every shortage at once so the client can fix the cart in one go.
    Free-text lines (without variant_id) are not inventory-tracked.
    """
    shortages: list[dict[str, object]] = []
    for r in rows:
        v = r.get("variant_obj")
        if v is None:
            continue
        available = max(0, (v.stock_boxes or 0) - (v.reserved_boxes or 0))
        if r["boxes"] > available:
            shortages.append({
                "variant_id": str(v.id),
                "sku": v.sku,
                "product_name": r["product_name"],
                "requested_boxes": r["boxes"],
                "available_boxes": available,
                "reason": "insufficient_stock",
            })
    if shortages:
        lines = ", ".join(
            f"{s['sku']} (нужно {s['requested_boxes']}, доступно {s['available_boxes']})"
            for s in shortages
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"Недостаточно товара на складе: {lines}",
                "out_of_stock": shortages,
            },
        )


async def _release_reservation(session: AsyncSession, order: Order) -> None:
    """Decrement ``reserved_boxes`` for every line of ``order``.

    Called when an order is cancelled/rejected — the boxes go back into the
    available pool. Variants are FOR-UPDATE-locked so a concurrent checkout on
    the same SKU sees consistent ``available`` after we commit. ``max(0, …)``
    guards against double-release if the same order is somehow cancelled
    twice (shouldn't happen, but cheap to be safe).
    """
    items_list = list((await session.scalars(
        select(OrderItem).where(OrderItem.order_id == order.id)
    )).all())
    variant_ids = [i.variant_id for i in items_list if i.variant_id is not None]
    if not variant_ids:
        return
    variants = (await session.scalars(
        select(ProductVariant)
        .where(ProductVariant.id.in_(variant_ids))
        .with_for_update()
    )).all()
    by_id = {v.id: v for v in variants}
    for it in items_list:
        if it.variant_id and (v := by_id.get(it.variant_id)) is not None:
            v.reserved_boxes = max(0, (v.reserved_boxes or 0) - it.boxes)


async def _ship_reservation(session: AsyncSession, order: Order) -> None:
    """Convert the order's reservation into a real stock decrement.

    Called when an order is marked `shipped`: subtract from both
    ``stock_boxes`` and ``reserved_boxes``, and append a `StockMovement` row
    so the warehouse audit log reflects the outbound shipment.
    """
    items_list = list((await session.scalars(
        select(OrderItem).where(OrderItem.order_id == order.id)
    )).all())
    variant_ids = [i.variant_id for i in items_list if i.variant_id is not None]
    if not variant_ids:
        return
    variants = (await session.scalars(
        select(ProductVariant)
        .where(ProductVariant.id.in_(variant_ids))
        .with_for_update()
    )).all()
    by_id = {v.id: v for v in variants}
    for it in items_list:
        if it.variant_id and (v := by_id.get(it.variant_id)) is not None:
            v.stock_boxes = max(0, (v.stock_boxes or 0) - it.boxes)
            v.reserved_boxes = max(0, (v.reserved_boxes or 0) - it.boxes)
            session.add(StockMovement(
                variant_id=v.id,
                type=StockMovementType.out,
                qty_boxes=-it.boxes,
                source="order",
                comment=f"order #{order.order_number}",
            ))


# ========================================================================
# Client: create order
# ========================================================================


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
        existing = await session.scalar(select(User).where(User.email == guest_email))
        if existing is not None:
            user = existing
        else:
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

    total_boxes, subtotal, discount_percent, discount_amount, total, line_totals = (
        _compute_totals_canonical(canonical)
    )

    # Apply global discount tiers on top of any per-variant volume discounts.
    # The global tier is based on the total number of boxes in the order.
    global_tiers = (await session.scalars(select(DiscountTier))).all()
    global_pct = Decimal("0")
    for tier in global_tiers:
        pct = Decimal(str(tier.discount_percent))
        if total_boxes >= tier.min_boxes and pct > global_pct:
            global_pct = pct
    if global_pct > 0:
        global_discount = _q(subtotal * global_pct / Decimal("100"))
        discount_percent = global_pct
        discount_amount = _q(discount_amount + global_discount)
        total = _q(max(Decimal("0"), total - global_discount))

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
        select(Order)
        .order_by(Order.created_at.desc())
        .offset(p.offset)
        .limit(p.limit)
    )
    orders = list(res.all())
    await _attach_presigned_receipts(orders)
    return orders


@router.get(
    "/admin/orders/{order_id}",
    response_model=OrderOut,
    dependencies=[Depends(require_admin)],
)
async def admin_get_order(
    order_id: UUID, session: AsyncSession = Depends(db_session)
) -> Order:
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
    order = await session.get(Order, order_id)
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


async def _send_email_safe(
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> None:
    """BackgroundTasks wrapper — swallows errors into the log.

    The HTTP response has already been sent by the time this runs, so we
    cannot surface failures to the caller. Logging with `exc_info` keeps
    a trail for ops without leaking SMTP details to the client.
    """
    try:
        await send_email(
            to_email=to_email,
            subject=subject,
            body=body,
            html_body=html_body,
        )
    except Exception:
        logger.exception("Background send_email failed (to=%s)", to_email)


_COMPANY_SETTINGS_ID = 1


def _build_email_sender(company: CompanySettings | None) -> EmailSender:
    """Сборка `EmailSender` из настроек компании (или дефолтных значений).

    Вынесено в отдельный helper, потому что повторяется в каждой точке
    отправки писем по заявкам.
    """
    return EmailSender(
        company_name=company.short_name if company else "CANDWAX",
        phone=company.phone if company else "",
        email=company.email if company else "",
    )


async def _resolve_order_email(session: AsyncSession, order: Order) -> str | None:
    """Email клиента: сначала snapshot заявки, потом профиль пользователя."""
    if order.email:
        return order.email
    user = await session.get(User, order.user_id)
    return user.email if user else None


def _queue_status_change_email(
    background_tasks: BackgroundTasks,
    *,
    to_email: str,
    order_number: str,
    new_status: str,
    comment: str | None,
    sender: EmailSender,
    customer_name: str | None,
) -> None:
    """Поставить в фоновую очередь письмо о смене статуса заявки.

    Используется только для статусов БЕЗ специализированного шаблона
    (paid, payment_review, processing, completed). Approve/reject/
    mark-ready отправляют свои собственные письма и не должны звать
    этот helper, иначе клиент получит две нотификации на одно событие.
    """
    if not app_settings.smtp_host or not to_email:
        return
    plain_body, html_body = render_order_status_changed_email(
        order_number=order_number,
        new_status=new_status,
        comment=comment,
        sender=sender,
        customer_name=customer_name,
    )
    subject = f"Заявка №{order_number}: {order_status_label(new_status)}"
    background_tasks.add_task(
        _send_email_safe,
        to_email=to_email,
        subject=subject,
        body=plain_body,
        html_body=html_body,
    )


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
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    assert_transition_allowed(order.status, OrderStatus.awaiting_payment)

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
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    assert_transition_allowed(order.status, OrderStatus.cancelled)

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
    order = await session.get(Order, order_id)
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
                f"заявленный тип {content_type} не совпадает "
                f"с реальным содержимым ({detected})"
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
            await storage.delete_object(
                app_settings.storage_category_receipts, previous_key
            )
        except Exception:
            logger.exception(
                "failed to delete previous receipt object %s", previous_key
            )

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
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    assert_transition_allowed(order.status, OrderStatus.paid)

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
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    assert_transition_allowed(order.status, OrderStatus.shipped)

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
