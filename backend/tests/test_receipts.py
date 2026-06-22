"""Regression tests for the private-receipt flow (CRITICAL #2).

Receipts carry PII (full name, bank account, sometimes a passport scan), so
they must never be world-readable. With the local-filesystem backend the
guarantees are:

* receipts are stored under the `payment-receipts` storage category, which is
  **not** mounted by StaticFiles — there is no public URL that serves them;
* the database stores only the **storage key** in `payment_receipt_key`; the
  legacy `payment_receipt_url` column is no longer written by the API;
* every endpoint that returns an `Order` mints a short-lived **signed** URL
  (`/orders/{id}/receipt-file?exp=...&sig=...`) and puts it in
  `payment_receipt_url` on the response only;
* the signed endpoint validates the HMAC signature + expiry before serving the
  bytes; a tampered or expired link is rejected;
* admin notification emails carry no direct link to the receipt.

These tests pin the above so a regression — e.g. someone serving receipts via
StaticFiles, or dropping the signature check — fails loudly. They need no
external service (no MinIO/S3): storage is local disk.
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest

from app.core.config import settings as app_settings
from app.core.email_templates import render_receipt_uploaded_email

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_signed_receipt_url(url: str) -> bool:
    """A signed receipt URL points at the receipt-file endpoint and carries
    the `exp` + `sig` capability query params."""
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    return parsed.path.endswith("/receipt-file") and "exp" in qs and "sig" in qs


async def _seed_variant_with_stock(client, admin_token, auth_headers) -> str:
    prod = await client.post(
        "/admin/products",
        json={"slug": "rcpt-prod", "name_ru": "Тест", "name_en": "Test"},
        headers=auth_headers(admin_token),
    )
    product_id = prod.json()["id"]
    var = await client.post(
        f"/admin/products/{product_id}/variants",
        json={
            "sku": "RCPT-1",
            "pieces_per_box": 10,
            "price_per_piece_rub": 100,
            "price_per_piece_usd": 1.2,
            "stock_boxes": 5,
        },
        headers=auth_headers(admin_token),
    )
    return var.json()["id"]


async def _create_awaiting_payment_order(client, admin_token, client_token, auth_headers) -> str:
    """Drive an order to the `awaiting_payment` status so the client can
    legally upload a receipt."""
    variant_id = await _seed_variant_with_stock(client, admin_token, auth_headers)
    created = await client.post(
        "/orders",
        json={
            "items": [
                {
                    "variant_id": variant_id,
                    "sku": "RCPT-1",
                    "product_name": "Тест",
                    "variant_label": "Стандарт",
                    "pieces_per_box": 10,
                    "boxes": 1,
                    "unit_price": 100.0,
                }
            ]
        },
        headers=auth_headers(client_token),
    )
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]

    approved = await client.post(
        f"/admin/orders/{order_id}/approve",
        headers=auth_headers(admin_token),
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["new_status"] == "awaiting_payment"
    return order_id


def _png_bytes() -> bytes:
    """A minimal-but-valid 1×1 PNG."""
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
        b"\xff?\x00\x05\xfe\x02\xfe\xa3\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82"
    )


async def _upload_receipt(client, order_id: str, token: str, auth_headers) -> dict:
    files = {"file": ("receipt.png", _png_bytes(), "image/png")}
    resp = await client.post(
        f"/orders/{order_id}/receipt",
        files=files,
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_receipt_upload_returns_signed_url(client, admin_token, client_token, auth_headers):
    """The upload response hands back a signed receipt URL — not a public
    object URL — so a leak of the response body is bounded by the TTL.
    """
    order_id = await _create_awaiting_payment_order(client, admin_token, client_token, auth_headers)
    body = await _upload_receipt(client, order_id, client_token, auth_headers)

    assert body["new_status"] == "payment_review"
    assert _is_signed_receipt_url(body["receipt_url"]), body["receipt_url"]
    # The URL must NOT point at the public StaticFiles mount.
    assert "/uploads/" not in body["receipt_url"]


async def test_get_order_returns_freshly_minted_signed_url(
    client, admin_token, client_token, auth_headers
):
    """Every read of the order mints a signed URL for the same order; the
    path is stable (same order id) and the signature is valid.
    """
    order_id = await _create_awaiting_payment_order(client, admin_token, client_token, auth_headers)
    upload = await _upload_receipt(client, order_id, client_token, auth_headers)

    detail = await client.get(f"/orders/{order_id}", headers=auth_headers(client_token))
    assert detail.status_code == 200
    detail_url = detail.json()["payment_receipt_url"]
    assert detail_url is not None
    assert _is_signed_receipt_url(detail_url)

    # Both URLs target the same order's receipt-file endpoint.
    assert urlparse(upload["receipt_url"]).path == urlparse(detail_url).path
    assert order_id in detail_url


async def test_signed_url_actually_grants_access(client, admin_token, client_token, auth_headers):
    """The signed URL we hand the client must really fetch the file bytes."""
    order_id = await _create_awaiting_payment_order(client, admin_token, client_token, auth_headers)
    await _upload_receipt(client, order_id, client_token, auth_headers)
    detail = await client.get(f"/orders/{order_id}", headers=auth_headers(client_token))
    signed = detail.json()["payment_receipt_url"]

    # Fetch via the same ASGI client; the signed query string is the auth.
    parsed = urlparse(signed)
    got = await client.get(f"{parsed.path}?{parsed.query}")
    assert got.status_code == 200, got.text
    assert got.content == _png_bytes()
    assert got.headers["content-type"] == "image/png"


async def test_receipt_file_rejects_unsigned_and_tampered_requests(
    client, admin_token, client_token, auth_headers
):
    """Without a valid signature the receipt-file endpoint must refuse (403)."""
    order_id = await _create_awaiting_payment_order(client, admin_token, client_token, auth_headers)
    detail_after = await _upload_receipt(client, order_id, client_token, auth_headers)
    signed = detail_after["receipt_url"]
    parsed = urlparse(signed)
    qs = parse_qs(parsed.query)
    exp, sig = qs["exp"][0], qs["sig"][0]

    # No signature at all.
    r = await client.get(parsed.path)
    assert r.status_code in (403, 422), r.text  # 422 if exp/sig are required query params

    # Tampered signature.
    r = await client.get(f"{parsed.path}?exp={exp}&sig={sig[:-1]}0")
    assert r.status_code == 403, r.text

    # Expired link.
    r = await client.get(f"{parsed.path}?exp=1&sig={sig}")
    assert r.status_code == 403, r.text


async def test_receipts_not_served_by_staticfiles(client, admin_token, client_token, auth_headers):
    """The receipt file must NOT be reachable through the public /uploads
    mount, even if someone guesses the storage key."""
    order_id = await _create_awaiting_payment_order(client, admin_token, client_token, auth_headers)
    await _upload_receipt(client, order_id, client_token, auth_headers)

    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.models.order import Order

    async with AsyncSessionLocal() as s:
        row = await s.scalar(select(Order).where(Order.id == order_id))
    key = row.payment_receipt_key
    assert key

    # The receipts category is not mounted; this must 404.
    leaked = await client.get(f"/uploads/{app_settings.storage_category_receipts}/{key}")
    assert leaked.status_code == 404, leaked.status_code


async def test_admin_can_read_other_users_receipt(client, admin_token, client_token, auth_headers):
    """Admins must keep access to the receipt — they confirm payment."""
    order_id = await _create_awaiting_payment_order(client, admin_token, client_token, auth_headers)
    await _upload_receipt(client, order_id, client_token, auth_headers)

    admin_view = await client.get(f"/admin/orders/{order_id}", headers=auth_headers(admin_token))
    assert admin_view.status_code == 200
    url = admin_view.json()["payment_receipt_url"]
    assert url is not None and _is_signed_receipt_url(url)


async def test_other_client_cannot_see_receipt_url(client, admin_token, client_token, auth_headers):
    """A different non-admin user must NOT receive the order (and thus its
    receipt URL), even though the order ID alone is enough to query."""
    order_id = await _create_awaiting_payment_order(client, admin_token, client_token, auth_headers)
    await _upload_receipt(client, order_id, client_token, auth_headers)

    reg = await client.post(
        "/auth/register",
        json={"email": "snooper@example.com", "password": "Snoop-pw-123"},
    )
    assert reg.status_code == 201
    snooper_token = reg.cookies.get("cwh_access")
    assert snooper_token

    forbidden = await client.get(f"/orders/{order_id}", headers=auth_headers(snooper_token))
    assert forbidden.status_code == 403


async def test_receipt_upload_clears_legacy_url_column(
    client, admin_token, client_token, auth_headers, session
):
    """The new flow stores ONLY the storage key. The legacy
    `payment_receipt_url` column must be left empty so that
    `_attach_presigned_receipt` always uses the canonical key path.
    """
    from sqlalchemy import select

    from app.models.order import Order

    order_id = await _create_awaiting_payment_order(client, admin_token, client_token, auth_headers)
    await _upload_receipt(client, order_id, client_token, auth_headers)

    session.expire_all()
    row = await session.scalar(select(Order).where(Order.id == order_id))
    assert row is not None
    assert row.payment_receipt_key, "payment_receipt_key was not stored"
    assert row.payment_receipt_url is None


async def test_receipt_reupload_deletes_previous_file(
    client, admin_token, client_token, auth_headers, session
):
    """If the client re-uploads while the order is in `payment_review` the
    previous file is best-effort deleted, so storage doesn't grow with
    orphaned receipts.
    """
    from sqlalchemy import select

    from app.core import storage
    from app.models.order import Order

    order_id = await _create_awaiting_payment_order(client, admin_token, client_token, auth_headers)
    await _upload_receipt(client, order_id, client_token, auth_headers)

    session.expire_all()
    row = await session.scalar(select(Order).where(Order.id == order_id))
    first_key = row.payment_receipt_key
    assert first_key

    await _upload_receipt(client, order_id, client_token, auth_headers)
    session.expire_all()
    row = await session.scalar(select(Order).where(Order.id == order_id))
    second_key = row.payment_receipt_key
    assert second_key and second_key != first_key

    # First file must be gone, second must remain.
    assert await storage.read_object(app_settings.storage_category_receipts, first_key) is None
    assert (
        await storage.read_object(app_settings.storage_category_receipts, second_key)
        == _png_bytes()
    )


async def test_receipt_admin_email_does_not_contain_direct_url():
    """A sanity check on the email template: the rendered body must not embed
    a navigable receipt link — admins must open the order in the panel.
    """
    plain, html = render_receipt_uploaded_email(
        order_number="CW-2026-0001",
        company_name="ACME",
        contact_name="John Doe",
    )

    # Plain-text body must not embed any URL whatsoever.
    assert "http://" not in plain
    assert "https://" not in plain

    # HTML must not contain a clickable anchor.
    assert "<a " not in html, "navigable link present in admin email"
