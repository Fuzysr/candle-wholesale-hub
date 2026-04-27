"""Admin-only file uploads — product images and company signature/stamp.

The frontend used to hit Supabase Storage directly; now it goes through these
endpoints which enforce:

* admin role
* type allowlist (JPEG / PNG / WebP / AVIF)
* magic-byte sniffing — the declared `Content-Type` is **client-controlled**
  and an attacker can ship a polyglot HTML/JS file with `Content-Type:
  image/png`. Combined with the public-read bucket policy on
  `s3_bucket_products` / `s3_bucket_company`, that would land a stored XSS
  one click away.
* `UPLOAD_MAX_BYTES` size cap (5 MB by default)
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.api.deps import require_admin
from app.core import storage
from app.core.config import settings
from app.core.mime_sniff import detect_mime

router = APIRouter(
    prefix="/admin/uploads",
    tags=["uploads"],
    dependencies=[Depends(require_admin)],
)

_ALLOWED_IMAGE_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/avif"}
)


def _detect_image_mime(body: bytes) -> str | None:
    """Thin wrapper kept for backward-compat; delegates to ``detect_mime``.

    Only image formats are accepted here (no PDF), so we filter
    out non-image results from the shared sniffer.
    """
    detected = detect_mime(body)
    if detected and detected.startswith("image/"):
        return detected
    return None


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

    # Magic-byte check: actual file content must look like one of the
    # allowed image formats AND match the declared Content-Type. We
    # store using the *detected* type (not the client's claim), so even
    # if a future bug widens `_ALLOWED_IMAGE_TYPES`, the byte we serve
    # to browsers always matches the byte we inspected.
    detected = _detect_image_mime(body)
    if detected is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="file content does not match any supported image format",
        )
    if detected != content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"declared content-type {content_type} does not match "
                f"actual content ({detected})"
            ),
        )

    key = storage.generate_key(file.filename or "upload")
    url = await storage.upload_bytes(bucket, key, body, detected)
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
