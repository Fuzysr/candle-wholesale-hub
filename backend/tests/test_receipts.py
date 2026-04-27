"""Regression tests for the private-bucket receipt flow (CRITICAL #2).

The previous behaviour was insecure:

* the receipts bucket was made world-readable (`Principal: *`) on first
  use, so the client receipt — which carries PII (full name, bank
  account, sometimes a passport scan) — was downloadable by anyone who
  obtained or guessed the URL;
* the public URL was stored verbatim in `orders.payment_receipt_url` and
  echoed back from every order endpoint and admin email.

The fix:

* receipts live in a private bucket whose anonymous-GET policy is
  explicitly stripped on every `ensure_bucket(public_read=False)`;
* the database stores only the **object key** in the new column
  `payment_receipt_key`; the legacy `payment_receipt_url` is no longer
  written by the API;
* every endpoint that returns an `Order` mints a short-lived presigned
  URL on response and replaces the `payment_receipt_url` field with it;
* admin notification emails no longer carry any direct link to the
  receipt — admins must open the order in the panel.

These tests pin all of the above against real MinIO so that a
regression — e.g. someone re-introducing `public_read=True` for the
receipts bucket — fails loudly.
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import boto3
import httpx
import pytest
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import settings as app_settings
from app.core.email_templates import render_receipt_uploaded_email

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_presigned(url: str) -> bool:
    """An S3 presigned URL always carries the SigV4 query parameters."""
    qs = parse_qs(urlparse(url).query)
    return "X-Amz-Signature" in qs and "X-Amz-Credential" in qs


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


async def _create_awaiting_payment_order(
    client, admin_token, client_token, auth_headers
) -> str:
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
    """A minimal-but-valid 1×1 PNG so MinIO doesn't reject the upload."""
    # 1×1 transparent PNG (67 bytes)
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
        b"\xff?\x00\x05\xfe\x02\xfe\xa3\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82"
    )


async def _upload_receipt(
    client, order_id: str, token: str, auth_headers
) -> dict:
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


async def test_receipt_upload_returns_presigned_url(
    minio_reachable, client, admin_token, client_token, auth_headers
):
    """The upload response must hand back a presigned URL — not the raw
    object URL — so a leak of the response body is bounded by the TTL.
    """
    if not minio_reachable:
        pytest.skip("MinIO not reachable — receipt tests require real S3")

    order_id = await _create_awaiting_payment_order(
        client, admin_token, client_token, auth_headers
    )
    body = await _upload_receipt(client, order_id, client_token, auth_headers)

    assert body["new_status"] == "payment_review"
    assert _is_presigned(body["receipt_url"]), body["receipt_url"]


async def test_get_order_returns_freshly_minted_presigned_url(
    minio_reachable, client, admin_token, client_token, auth_headers
):
    """Every read of the order should mint a new presigned URL — both
    URLs must be valid, and the signatures must differ so a leaked URL
    really does expire after its TTL instead of being re-served verbatim.
    """
    if not minio_reachable:
        pytest.skip("MinIO not reachable — receipt tests require real S3")

    order_id = await _create_awaiting_payment_order(
        client, admin_token, client_token, auth_headers
    )
    upload = await _upload_receipt(client, order_id, client_token, auth_headers)

    detail = await client.get(
        f"/orders/{order_id}", headers=auth_headers(client_token)
    )
    assert detail.status_code == 200
    detail_url = detail.json()["payment_receipt_url"]
    assert detail_url is not None
    assert _is_presigned(detail_url)

    # Both URLs must point at the same bucket+key but carry independent
    # SigV4 query strings.
    upload_path = urlparse(upload["receipt_url"]).path
    detail_path = urlparse(detail_url).path
    assert upload_path == detail_path
    assert urlparse(upload["receipt_url"]).query != urlparse(detail_url).query


async def test_get_order_presigned_url_actually_grants_access(
    minio_reachable, client, admin_token, client_token, auth_headers
):
    """Sanity check: the presigned URL we hand the client must really
    fetch the object anonymously."""
    if not minio_reachable:
        pytest.skip("MinIO not reachable — receipt tests require real S3")

    order_id = await _create_awaiting_payment_order(
        client, admin_token, client_token, auth_headers
    )
    await _upload_receipt(client, order_id, client_token, auth_headers)
    detail = await client.get(
        f"/orders/{order_id}", headers=auth_headers(client_token)
    )
    presigned = detail.json()["payment_receipt_url"]

    async with httpx.AsyncClient(timeout=5.0) as http:
        got = await http.get(presigned)
    assert got.status_code == 200
    assert got.content == _png_bytes()


async def test_receipt_bucket_rejects_anonymous_get(
    minio_reachable, client, admin_token, client_token, auth_headers
):
    """The bucket policy must NOT make objects world-readable. A GET
    request without a signature must therefore be rejected (4xx)."""
    if not minio_reachable:
        pytest.skip("MinIO not reachable — receipt tests require real S3")

    order_id = await _create_awaiting_payment_order(
        client, admin_token, client_token, auth_headers
    )
    body = await _upload_receipt(client, order_id, client_token, auth_headers)

    parsed = urlparse(body["receipt_url"])
    raw_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    assert "X-Amz-Signature" not in raw_url

    async with httpx.AsyncClient(timeout=5.0) as http:
        got = await http.get(raw_url)
    # MinIO returns 403 AccessDenied for anonymous GET on a private bucket.
    assert got.status_code in (401, 403), (
        f"private bucket leaked via raw URL: status={got.status_code}, "
        f"body={got.text!r}"
    )


async def test_admin_can_read_other_users_receipt(
    minio_reachable, client, admin_token, client_token, auth_headers
):
    """Admins must keep access to the receipt — they confirm payment."""
    if not minio_reachable:
        pytest.skip("MinIO not reachable — receipt tests require real S3")

    order_id = await _create_awaiting_payment_order(
        client, admin_token, client_token, auth_headers
    )
    await _upload_receipt(client, order_id, client_token, auth_headers)

    admin_view = await client.get(
        f"/admin/orders/{order_id}", headers=auth_headers(admin_token)
    )
    assert admin_view.status_code == 200
    url = admin_view.json()["payment_receipt_url"]
    assert url is not None and _is_presigned(url)


async def test_other_client_cannot_see_receipt_url(
    minio_reachable, client, admin_token, client_token, auth_headers
):
    """A different non-admin user must NOT receive the presigned URL,
    even though the order ID alone is enough to query."""
    if not minio_reachable:
        pytest.skip("MinIO not reachable — receipt tests require real S3")

    order_id = await _create_awaiting_payment_order(
        client, admin_token, client_token, auth_headers
    )
    await _upload_receipt(client, order_id, client_token, auth_headers)

    reg = await client.post(
        "/auth/register",
        json={"email": "snooper@example.com", "password": "snoop-pw-123"},
    )
    assert reg.status_code == 201
    snooper_token = reg.json()["access"]

    forbidden = await client.get(
        f"/orders/{order_id}", headers=auth_headers(snooper_token)
    )
    assert forbidden.status_code == 403


async def test_receipt_upload_clears_legacy_url_column(
    minio_reachable, client, admin_token, client_token, auth_headers, session
):
    """The new flow stores ONLY the object key. The legacy
    `payment_receipt_url` column must be left empty so that
    `_attach_presigned_receipt` always uses the canonical key path.
    """
    if not minio_reachable:
        pytest.skip("MinIO not reachable — receipt tests require real S3")

    from sqlalchemy import select

    from app.models.order import Order

    order_id = await _create_awaiting_payment_order(
        client, admin_token, client_token, auth_headers
    )
    await _upload_receipt(client, order_id, client_token, auth_headers)

    session.expire_all()
    row = await session.scalar(select(Order).where(Order.id == order_id))
    assert row is not None
    # Canonical pointer is the key:
    assert row.payment_receipt_key, "payment_receipt_key was not stored"
    # Legacy URL column must NOT be populated by new uploads — anything
    # left there would leak as a public-style URL on response if a future
    # bug accidentally bypassed `_attach_presigned_receipt`.
    assert row.payment_receipt_url is None


async def test_receipt_reupload_deletes_previous_object(
    minio_reachable, client, admin_token, client_token, auth_headers, session
):
    """If the client re-uploads while the order is in `payment_review`
    the previous object is best-effort deleted, so the bucket doesn't
    grow with orphaned receipts that might still be reachable via a
    presigned URL leaked earlier.
    """
    if not minio_reachable:
        pytest.skip("MinIO not reachable — receipt tests require real S3")

    order_id = await _create_awaiting_payment_order(
        client, admin_token, client_token, auth_headers
    )
    first = await _upload_receipt(client, order_id, client_token, auth_headers)
    second = await _upload_receipt(client, order_id, client_token, auth_headers)

    first_key = urlparse(first["receipt_url"]).path.rsplit("/", 1)[-1]
    second_key = urlparse(second["receipt_url"]).path.rsplit("/", 1)[-1]
    assert first_key != second_key

    s3 = boto3.client(
        "s3",
        endpoint_url=app_settings.s3_endpoint_url,
        aws_access_key_id=app_settings.s3_access_key,
        aws_secret_access_key=app_settings.s3_secret_key,
        region_name=app_settings.s3_region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )

    # First object must be gone.
    with pytest.raises(ClientError) as exc_info:
        s3.head_object(Bucket=app_settings.s3_bucket_receipts, Key=first_key)
    assert exc_info.value.response["Error"]["Code"] in {"404", "NoSuchKey"}

    # Second object must still be there.
    head = s3.head_object(Bucket=app_settings.s3_bucket_receipts, Key=second_key)
    assert head["ResponseMetadata"]["HTTPStatusCode"] == 200


@pytest.mark.asyncio(loop_scope="session")
async def test_receipt_admin_email_does_not_contain_direct_url():
    """A sanity check on the email template itself: even if a future
    refactor brings a `receipt_url` parameter back, the rendered body
    must not embed a navigable receipt link — that's the whole point of
    the private-bucket switch.

    We deliberately ignore the standard XHTML DTD / xmlns URIs that show
    up in the document header — those are namespace identifiers, never
    fetched, and stripping them per-template would only obscure intent.
    """
    plain, html = render_receipt_uploaded_email(
        order_number="WC-2026-0001",
        company_name="ACME",
        contact_name="John Doe",
    )

    # Plain-text body must not embed any URL whatsoever.
    assert "http://" not in plain
    assert "https://" not in plain

    # HTML must not contain a clickable anchor and must not echo any
    # presigned-URL signature parameters or our receipts-bucket name.
    assert "<a " not in html, "navigable link present in admin email"
    assert "X-Amz-Signature" not in html
    assert app_settings.s3_bucket_receipts not in html
    assert app_settings.s3_endpoint_url not in html
    assert app_settings.s3_public_url_base not in html
