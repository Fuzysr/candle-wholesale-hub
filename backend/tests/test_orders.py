"""Order creation + status workflow tests."""
import pytest

pytestmark = pytest.mark.asyncio


async def _seed_product_and_variant(client, admin_token, auth_headers):
    prod = await client.post(
        "/admin/products",
        json={"slug": "tea-light", "name_ru": "Чайная", "name_en": "Tea light"},
        headers=auth_headers(admin_token),
    )
    product_id = prod.json()["id"]
    var = await client.post(
        f"/admin/products/{product_id}/variants",
        json={
            "sku": "TL-CL-W-50",
            "pieces_per_box": 100,
            "price_per_piece_rub": 14.5,
            "price_per_piece_usd": 0.16,
            "stock_boxes": 50,
        },
        headers=auth_headers(admin_token),
    )
    return var.json()["id"]


async def test_create_order_computes_totals_and_assigns_number(
    client, admin_token, client_token, auth_headers
):
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    # seed a discount tier that applies at 20+ boxes
    await client.post(
        "/admin/discount-tiers",
        json={"min_boxes": 20, "discount_percent": 10},
        headers=auth_headers(admin_token),
    )

    body = {
        "currency": "RUB",
        "delivery_address": "Москва, склад 1",
        "items": [
            {
                "variant_id": variant_id,
                "sku": "TL-CL-W-50",
                "product_name": "Чайная",
                "variant_label": "Белый",
                "pieces_per_box": 100,
                "boxes": 25,
                "unit_price": 14.5,
            }
        ],
    }
    resp = await client.post("/orders", json=body, headers=auth_headers(client_token))
    assert resp.status_code == 201, resp.text
    data = resp.json()

    assert data["order_number"].startswith("WC-")
    assert data["total_boxes"] == 25
    # 100 * 25 * 14.5 = 36250
    assert data["subtotal"] == pytest.approx(36250.0)
    assert data["discount_percent"] == pytest.approx(10.0)
    assert data["discount_amount"] == pytest.approx(3625.0)
    assert data["total"] == pytest.approx(32625.0)
    assert data["status"] == "new"
    assert len(data["items"]) == 1


async def test_my_orders_isolated_per_user(
    client, client_token, admin_token, auth_headers
):
    # create as client
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    item = {
        "variant_id": variant_id,
        "sku": "TL-CL-W-50",
        "product_name": "Чайная",
        "variant_label": "Белый",
        "pieces_per_box": 100,
        "boxes": 1,
        "unit_price": 14.5,
    }
    own = await client.post(
        "/orders", json={"items": [item]}, headers=auth_headers(client_token)
    )
    own_id = own.json()["id"]

    # a second user must not see the first user's orders
    reg = await client.post(
        "/auth/register",
        json={"email": "peeper@x.com", "password": "pwpwpw"},
    )
    other_token = reg.json()["access"]

    listed = await client.get("/orders", headers=auth_headers(other_token))
    assert listed.status_code == 200
    assert listed.json() == []

    fetched = await client.get(
        f"/orders/{own_id}", headers=auth_headers(other_token)
    )
    assert fetched.status_code == 403


async def test_admin_can_update_order_status_and_writes_history(
    client, admin_token, client_token, auth_headers, session
):
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    created = await client.post(
        "/orders",
        json={
            "items": [
                {
                    "variant_id": variant_id,
                    "sku": "TL-CL-W-50",
                    "product_name": "Чайная",
                    "variant_label": "Белый",
                    "pieces_per_box": 100,
                    "boxes": 2,
                    "unit_price": 14.5,
                }
            ]
        },
        headers=auth_headers(client_token),
    )
    order_id = created.json()["id"]

    # non-admin cannot update
    forbidden = await client.patch(
        f"/admin/orders/{order_id}",
        json={"status": "processing"},
        headers=auth_headers(client_token),
    )
    assert forbidden.status_code == 403

    # admin transitions the order
    updated = await client.patch(
        f"/admin/orders/{order_id}",
        json={"status": "processing", "admin_comment": "взяли в работу"},
        headers=auth_headers(admin_token),
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "processing"

    # history row should have been added
    from sqlalchemy import select
    from app.models.order import OrderStatusHistory

    rows = (
        await session.scalars(
            select(OrderStatusHistory).where(OrderStatusHistory.order_id == order_id)
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].status.value == "processing"
