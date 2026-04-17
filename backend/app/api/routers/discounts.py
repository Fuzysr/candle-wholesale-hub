"""Discount tiers — public read, admin CRUD."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, require_admin
from app.models.stock import DiscountTier
from app.schemas.stock import DiscountTierCreate, DiscountTierOut, DiscountTierUpdate

router = APIRouter(tags=["discounts"])


@router.get("/discount-tiers", response_model=list[DiscountTierOut])
async def list_discount_tiers(session: AsyncSession = Depends(db_session)) -> list[DiscountTier]:
    res = await session.scalars(select(DiscountTier).order_by(DiscountTier.min_boxes))
    return list(res.all())


@router.post(
    "/admin/discount-tiers",
    response_model=DiscountTierOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_discount_tier(
    payload: DiscountTierCreate, session: AsyncSession = Depends(db_session)
) -> DiscountTier:
    tier = DiscountTier(**payload.model_dump())
    session.add(tier)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="min_boxes already used"
        ) from exc
    await session.refresh(tier)
    return tier


@router.patch(
    "/admin/discount-tiers/{tier_id}",
    response_model=DiscountTierOut,
    dependencies=[Depends(require_admin)],
)
async def update_discount_tier(
    tier_id: UUID,
    payload: DiscountTierUpdate,
    session: AsyncSession = Depends(db_session),
) -> DiscountTier:
    tier = await session.get(DiscountTier, tier_id)
    if tier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tier not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tier, k, v)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="min_boxes already used"
        ) from exc
    await session.refresh(tier)
    return tier


@router.delete(
    "/admin/discount-tiers/{tier_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_discount_tier(
    tier_id: UUID, session: AsyncSession = Depends(db_session)
) -> None:
    tier = await session.get(DiscountTier, tier_id)
    if tier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tier not found")
    await session.delete(tier)
    await session.commit()
