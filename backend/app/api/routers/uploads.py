"""Admin-only file uploads — product images and company signature/stamp.

The frontend used to hit Supabase Storage directly; now it goes through these
endpoints which enforce:

* admin role
* type allowlist (JPEG / PNG / WebP / AVIF)
* `UPLOAD_MAX_BYTES` size cap (5 MB by default)
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.api.deps import require_admin
from app.core import storage
from app.core.config import settings

router = APIRouter(
    prefix="/admin/uploads",
    tags=["uploads"],
    dependencies=[Depends(require_admin)],
)

_ALLOWED_IMAGE_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/avif"}
)


class UploadOut(BaseModel):
    url: str


class DeleteIn(BaseModel):
    url: str


async def _store_image(file: UploadFile, bucket: str) -> UploadOut:
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unsupported content type: {content_type or 'unknown'}",
        )

    # `UploadFile` streams from a SpooledTemporaryFile, so reading all of it is
    # safe for the small size cap we enforce below.
    body = await file.read()
    if len(body) > settings.upload_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"file too large (> {settings.upload_max_bytes} bytes)",
        )
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="empty upload"
        )

    key = storage.generate_key(file.filename or "upload")
    url = await storage.upload_bytes(bucket, key, body, content_type)
    return UploadOut(url=url)


@router.post("/product-images", response_model=UploadOut)
async def upload_product_image(file: UploadFile = File(...)) -> UploadOut:
    return await _store_image(file, settings.s3_bucket_products)


@router.post("/company-assets", response_model=UploadOut)
async def upload_company_asset(file: UploadFile = File(...)) -> UploadOut:
    return await _store_image(file, settings.s3_bucket_company)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(payload: DeleteIn) -> None:
    parsed = storage.parse_s3_url(
        payload.url,
        buckets=[settings.s3_bucket_products, settings.s3_bucket_company],
    )
    if parsed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="url does not point at a managed bucket",
        )
    bucket, key = parsed
    await storage.delete_object(bucket, key)
