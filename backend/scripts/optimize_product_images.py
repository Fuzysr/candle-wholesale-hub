"""Warm responsive derivatives for existing product images.

Run from ``backend/`` after deploying the Pillow dependency:
``python -m scripts.optimize_product_images``.
The operation is idempotent and skips already generated derivatives.
"""
from __future__ import annotations

from pathlib import Path

from app.core import image_optimizer
from app.core.config import settings


def main() -> None:
    root = Path(settings.local_storage_root) / settings.storage_category_products
    if not root.exists():
        print(f"Image directory does not exist: {root}")
        return

    processed = failed = 0
    variant_suffixes = tuple(f"-{w}" for w in image_optimizer.VARIANT_WIDTHS)
    for source in sorted(root.iterdir()):
        if not source.is_file() or source.stem.endswith(variant_suffixes):
            continue
        try:
            image_optimizer.generate_variants(source)
            processed += 1
        except Exception as exc:
            failed += 1
            print(f"Failed: {source.name}: {exc}")
    print(f"Optimized {processed} source images; failed {failed}.")


if __name__ == "__main__":
    main()
