"""Public optimized media endpoints."""
from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.core import image_optimizer, storage
from app.core.config import settings

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/product-images/{key}")
async def optimized_product_image(
    key: str,
    width: int = Query(640, ge=320, le=1280),
    format: Literal["webp", "jpg"] = "webp",
) -> FileResponse:
    """Serve a cached responsive derivative for a public product image."""
    try:
        source = storage.local_path(settings.storage_category_products, key)
        target = image_optimizer.variant_path(source, width, format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid image path") from exc

    if not source.is_file():
        raise HTTPException(status_code=404, detail="image not found")

    try:
        if not target.is_file():
            await asyncio.to_thread(image_optimizer.generate_variants, source)
    except Exception as exc:  # pragma: no cover - depends on uploaded bytes
        raise HTTPException(status_code=415, detail="image cannot be optimized") from exc

    if not target.is_file():
        raise HTTPException(status_code=404, detail="optimized image not found")
    return FileResponse(
        target,
        media_type="image/webp" if format == "webp" else "image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
