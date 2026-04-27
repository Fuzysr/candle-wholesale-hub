"""Magic-byte detection for uploaded files.

Centralised here so both ``uploads.py`` (product images) and
``orders.py`` (payment receipts) share the same sniffing logic.
Duplicating it in two routers was how the receipt upload ended up
without the check in the first place (M1).

Only formats we *actually accept* are recognised — unknown magic
returns ``None`` and the caller rejects the file.
"""


def detect_mime(body: bytes) -> str | None:
    """Return the canonical MIME type based on the first bytes, or ``None``.

    Supported formats:

    * **JPEG** — ``FF D8 FF``
    * **PNG**  — ``89 50 4E 47 0D 0A 1A 0A``
    * **WebP** — RIFF container: ``RIFF????WEBP``
    * **AVIF** — ISOBMFF: ``ftyp`` box with ``avif``/``avis`` brand
    * **PDF**  — ``%PDF-``
    """
    if len(body) < 12:
        return None

    if body[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if body[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return "image/webp"
    if body[4:8] == b"ftyp" and body[8:12] in (b"avif", b"avis"):
        return "image/avif"
    if body[:5] == b"%PDF-":
        return "application/pdf"
    return None
