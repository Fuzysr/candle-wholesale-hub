"""Access control tests — coverage for what used to be enforced via RLS."""
import pytest

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize(
    "method, path",
    [
        ("post", "/admin/categories"),
        ("post", "/admin/products"),
        ("post", "/admin/discount-tiers"),
        ("patch", "/admin/company-settings"),
        ("get", "/admin/orders"),
        ("get", "/admin/stock"),
        ("get", "/inventory/sync"),
    ],
)
async def test_admin_only_endpoints_reject_client(
    client, client_token, auth_headers, method, path
):
    fn = getattr(client, method)
    kwargs = {"headers": auth_headers(client_token)}
    if method in {"post", "patch"}:
        kwargs["json"] = {}
    resp = await fn(path, **kwargs)
    assert resp.status_code == 403, f"{method.upper()} {path} → {resp.status_code}"


async def test_admin_only_endpoints_reject_anonymous(client):
    resp = await client.get("/admin/orders")
    assert resp.status_code == 401


async def test_inventory_webhook_requires_secret(client):
    payload = {"updates": [{"sku": "X", "stock_boxes": 0}]}
    no_secret = await client.post("/inventory/webhook", json=payload)
    assert no_secret.status_code == 401

    wrong = await client.post(
        "/inventory/webhook", json=payload, headers={"x-webhook-secret": "nope"}
    )
    assert wrong.status_code == 401


async def test_inventory_webhook_updates_stock(
    client, admin_token, auth_headers
):
    # seed a variant via admin endpoints
    prod = await client.post(
        "/admin/products",
        json={"slug": "sku-seed", "name_ru": "n", "name_en": "n"},
        headers=auth_headers(admin_token),
    )
    await client.post(
        f"/admin/products/{prod.json()['id']}/variants",
        json={
            "sku": "SKU-1",
            "pieces_per_box": 1,
            "price_per_piece_rub": 1,
            "price_per_piece_usd": 1,
            "stock_boxes": 0,
        },
        headers=auth_headers(admin_token),
    )

    from app.core.config import settings

    resp = await client.post(
        "/inventory/webhook",
        json={"updates": [{"sku": "SKU-1", "stock_boxes": 42}]},
        headers={"x-webhook-secret": settings.inventory_webhook_secret},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"ok": True, "matched": 1, "updated": 1, "errors": []}
