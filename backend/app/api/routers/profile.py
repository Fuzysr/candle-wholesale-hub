"""Profile endpoints — authenticated user reads/updates their own data."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, get_current_user
from app.models.user import User
from app.schemas.user import ProfileUpdateIn, UserOut

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=UserOut)
async def get_profile(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("", response_model=UserOut)
async def update_profile(
    payload: ProfileUpdateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(db_session),
) -> UserOut:
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    await session.commit()
    await session.refresh(user)
    return UserOut.model_validate(user)
