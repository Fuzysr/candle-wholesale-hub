from pathlib import Path

from PIL import Image

from app.core.image_optimizer import VARIANT_WIDTHS, generate_variants


def test_generate_variants_is_idempotent(tmp_path: Path):
    source = tmp_path / "sample.png"
    Image.new("RGB", (1200, 1600), "#d17a45").save(source, "PNG")

    first = generate_variants(source)
    second = generate_variants(source)

    assert len(first) == len(VARIANT_WIDTHS) * 2
    assert [path.stat().st_mtime_ns for path in first] == [path.stat().st_mtime_ns for path in second]
    assert all(path.exists() and path.stat().st_size > 0 for path in first)
    assert (source.with_name("sample-320.webp")).stat().st_size < source.stat().st_size
