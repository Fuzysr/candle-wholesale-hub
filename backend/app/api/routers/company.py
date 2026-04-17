"""Company settings — singleton row used for the invoice template.

Public GET so the storefront can render contact details; admin-only PATCH.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session, require_admin
from app.models.company import CompanySettings
from app.schemas.company import CompanySettingsOut, CompanySettingsUpdate

router = APIRouter(tags=["company"])

COMPANY_ID = 1


async def _get_settings(session: AsyncSession) -> CompanySettings:
    row = await session.get(CompanySettings, COMPANY_ID)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="company settings row missing (migration should seed id=1)",
        )
    return row


@router.get("/company-settings", response_model=CompanySettingsOut)
async def get_company_settings(session: AsyncSession = Depends(db_session)) -> CompanySettings:
    return await _get_settings(session)


@router.patch(
    "/admin/company-settings",
    response_model=CompanySettingsOut,
    dependencies=[Depends(require_admin)],
)
async def update_company_settings(
    payload: CompanySettingsUpdate,
    session: AsyncSession = Depends(db_session),
) -> CompanySettings:
    row = await _get_settings(session)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return row
