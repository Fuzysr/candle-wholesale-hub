"""Admin: user management endpoints."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, require_admin
from app.api.pagination import PaginationParams, pagination_params
from app.models.order import Order
from app.models.user import User
from app.schemas.user import UserOut

router = APIRouter(tags=["admin-users"])


class UserOrderStatsOut(BaseModel):
    order_count: int
    total_revenue: str  # строка, чтобы не терять precision на float


@router.get(
    "/admin/users",
    response_model=list[UserOut],
    dependencies=[Depends(require_admin)],
)
async def admin_list_users(
    p: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(db_session),
) -> list[User]:
    res = await session.scalars(
        select(User)
        .order_by(User.created_at.desc())
        .offset(p.offset)
        .limit(p.limit)
    )
    return list(res.all())


@router.get(
    "/admin/users/{user_id}/order-stats",
    response_model=UserOrderStatsOut,
    dependencies=[Depends(require_admin)],
)
async def admin_user_order_stats(
    user_id: UUID,
    session: AsyncSession = Depends(db_session),
) -> UserOrderStatsOut:
    """Return order count + total revenue for a single user."""
    row = (
        await session.execute(
            select(
                func.count(Order.id).label("order_count"),
                func.coalesce(func.sum(Order.total), 0).label("total_revenue"),
            ).where(Order.user_id == user_id)
        )
    ).one()
    return UserOrderStatsOut(
        order_count=int(row.order_count),
        total_revenue=str(row.total_revenue),
    )
