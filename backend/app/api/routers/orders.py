"""Orders API.

Business rules mirror what the old Supabase flow did on the client:

* server-side recomputation of `total_boxes`, `subtotal`, `discount_percent`,
  `discount_amount`, `total` from the incoming items + discount tiers
* `order_number` is auto-assigned by the DB trigger (`generate_order_number`)
* status changes by admins are logged into `order_status_history`
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import db_session, get_current_user, require_admin
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.stock import DiscountTier
from app.models.user import User
from app.schemas.order import (
    OrderCreate,
    OrderItemIn,
    OrderListOut,
    OrderOut,
    OrderUpdateAdmin,
)

router = APIRouter(tags=["orders"])


def _compute_totals(
    items: list[OrderItemIn],
    tiers: list[DiscountTier],
) -> tuple[int, float, float, float, float, list[float]]:
    """Return `(total_boxes, subtotal, discount_percent, discount_amount, total, line_totals)`."""
    line_totals: list[float] = []
    total_boxes = 0
    subtotal = 0.0
    for item in items:
        line = float(item.unit_price) * item.pieces_per_box * item.boxes
        line_totals.append(line)
        total_boxes += item.boxes
        subtotal += line

    discount_percent = 0.0
    for t in tiers:
        if total_boxes >= t.min_boxes and float(t.discount_percent) > discount_percent:
            discount_percent = float(t.discount_percent)

    discount_amount = round(subtotal * discount_percent / 100.0, 2)
    total = round(subtotal - discount_amount, 2)
    subtotal = round(subtotal, 2)
    return total_boxes, subtotal, discount_percent, discount_amount, total, line_totals


async def _load_order(session: AsyncSession, order_id: UUID) -> Order | None:
    return await session.scalar(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )


# ========================================================================
# Client: create order
# ========================================================================


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session),
) -> Order:
    tiers = list((await session.scalars(select(DiscountTier))).all())
    total_boxes, subtotal, discount_percent, discount_amount, total, line_totals = _compute_totals(
        payload.items, tiers
    )

    order = Order(
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

    for item, line_total in zip(payload.items, line_totals, strict=True):
        session.add(
            OrderItem(
                order_id=order.id,
                variant_id=item.variant_id,
                sku=item.sku,
                product_name=item.product_name,
                variant_label=item.variant_label,
                pieces_per_box=item.pieces_per_box,
                boxes=item.boxes,
                unit_price=item.unit_price,
                line_total=round(line_total, 2),
            )
        )

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
    return full


# ========================================================================
# Client: my orders
# ========================================================================


@router.get("/orders", response_model=list[OrderListOut])
async def list_my_orders(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session),
) -> list[Order]:
    res = await session.scalars(
        select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())
    )
    return list(res.all())


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
    return order


# ========================================================================
# Admin: list + status updates
# ========================================================================


@router.get(
    "/admin/orders",
    response_model=list[OrderListOut],
    dependencies=[Depends(require_admin)],
)
async def admin_list_orders(session: AsyncSession = Depends(db_session)) -> list[Order]:
    res = await session.scalars(select(Order).order_by(Order.created_at.desc()))
    return list(res.all())


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
    return order


@router.patch(
    "/admin/orders/{order_id}",
    response_model=OrderOut,
)
async def admin_update_order(
    order_id: UUID,
    payload: OrderUpdateAdmin,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(db_session),
) -> Order:
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    status_changed = payload.status is not None and payload.status != order.status
    if payload.status is not None:
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

    await session.commit()
    full = await _load_order(session, order.id)
    assert full is not None
    return full
