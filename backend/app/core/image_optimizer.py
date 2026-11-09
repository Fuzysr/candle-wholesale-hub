"""Generate cached, responsive product-image derivatives."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps

VARIANT_WIDTHS = (320, 640, 960, 1280)
WEBP_QUALITY = 82
JPEG_QUALITY = 84


def _variant_path(source: Path, width: int, extension: str) -> Path:
    return source.with_name(f"{source.stem}-{width}.{extension}")


def _jpeg_image(image: Image.Image) -> Image.Image:
    """Return RGB, flattening transparency onto white for JPEG fallback."""
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, "white")
        return Image.alpha_composite(background, rgba).convert("RGB")
    return image.convert("RGB")


def generate_variants(source: Path, *, overwrite: bool = False) -> list[Path]:
    """Create WebP and JPEG derivatives for one source image.

    Existing derivatives are skipped, so this is safe to run on every deploy.
    Call from ``asyncio.to_thread`` in request handlers.
    """
    if not source.is_file():
        raise FileNotFoundError(source)

    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        image.load()
        if image.width < 1 or image.height < 1:
            raise ValueError("image has invalid dimensions")

        result: list[Path] = []
        for width in VARIANT_WIDTHS:
            webp_path = _variant_path(source, width, "webp")
            jpeg_path = _variant_path(source, width, "jpg")
            if overwrite or not webp_path.exists() or not jpeg_path.exists():
                resized = image.copy()
                resized.thumbnail((width, width * 4), Image.Resampling.LANCZOS)
                resized.save(webp_path, "WEBP", quality=WEBP_QUALITY, method=6)
                resized_jpeg = _jpeg_image(resized)
                resized_jpeg.save(
                    jpeg_path,
                    "JPEG",
                    quality=JPEG_QUALITY,
                    optimize=True,
                    progressive=True,
                )
                resized_jpeg.close()
                resized.close()
            result.extend((webp_path, jpeg_path))
        return result


def variant_path(source: Path, width: int, extension: str) -> Path:
    if width not in VARIANT_WIDTHS:
        raise ValueError(f"unsupported image width: {width}")
    if extension not in {"webp", "jpg"}:
        raise ValueError(f"unsupported image format: {extension}")
    return _variant_path(source, width, extension)
