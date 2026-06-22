"""Order creation + status workflow tests."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
import pytest
from sqlalchemy.engine import make_url

from app.core.config import settings

pytestmark = pytest.mark.asyncio

# Row-level locking (`SELECT ... FOR UPDATE`) is what makes concurrent
# checkouts safe. SQLite has no row locks (it serialises writes with a
# database-level lock and raises "database is locked" instead), so the
# concurrency stress test can only be validated on a real locking backend
# such as MySQL/InnoDB.
_DIALECT = make_url(settings.database_url).get_backend_name()
_requires_row_locks = pytest.mark.skipif(
    _DIALECT == "sqlite",
    reason="SELECT ... FOR UPDATE row locking unsupported on SQLite; run on MySQL",
)


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


async def _get_variant_state(session, variant_id):
    """Re-fetch a variant fresh from DB so we don't read stale ORM cache."""
    from sqlalchemy import select

    from app.models.catalog import ProductVariant

    # `expire_all` forces SQLAlchemy to reload from the DB on next access —
    # otherwise the session-scoped fixture keeps stale `reserved_boxes` from
    # an earlier read in the same test.
    session.expire_all()
    return await session.scalar(select(ProductVariant).where(ProductVariant.id == UUID(variant_id)))


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

    assert data["order_number"].startswith("CW-")
    assert data["total_boxes"] == 25
    # 100 * 25 * 14.5 = 36250
    assert data["subtotal"] == pytest.approx(36250.0)
    assert data["discount_percent"] == pytest.approx(10.0)
    assert data["discount_amount"] == pytest.approx(3625.0)
    assert data["total"] == pytest.approx(32625.0)
    assert data["status"] == "new"
    assert len(data["items"]) == 1


async def test_quote_matches_created_order_with_stacked_discounts(
    client, admin_token, client_token, auth_headers, session
):
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    volume_discount = await client.put(
        f"/admin/variants/{variant_id}/volume-discounts",
        json=[{"min_boxes": 20, "discount_percent": 5}],
        headers=auth_headers(admin_token),
    )
    assert volume_discount.status_code == 200, volume_discount.text
    global_discount = await client.post(
        "/admin/discount-tiers",
        json={"min_boxes": 20, "discount_percent": 10},
        headers=auth_headers(admin_token),
    )
    assert global_discount.status_code == 201, global_discount.text

    item = {
        "variant_id": variant_id,
        "sku": "TL-CL-W-50",
        "product_name": "Tea light",
        "pieces_per_box": 100,
        "boxes": 25,
        "unit_price": 0.01,
    }
    quote = await client.post("/orders/quote", json={"currency": "RUB", "items": [item]})
    assert quote.status_code == 200, quote.text

    # Quoting is read-only and must not reserve inventory.
    variant_after_quote = await _get_variant_state(session, variant_id)
    assert variant_after_quote.reserved_boxes == 0

    stale = await client.post(
        "/orders",
        json={
            "currency": "RUB",
            "items": [item],
            "quoted_total": quote.json()["total"] + 1,
        },
        headers=auth_headers(client_token),
    )
    assert stale.status_code == 409, stale.text

    created = await client.post(
        "/orders",
        json={
            "currency": "RUB",
            "items": [item],
            "quoted_total": quote.json()["total"],
        },
        headers=auth_headers(client_token),
    )
    assert created.status_code == 201, created.text

    actual = created.json()
    expected = quote.json()
    for field in (
        "total_boxes",
        "subtotal",
        "discount_percent",
        "discount_amount",
        "total",
    ):
        assert actual[field] == pytest.approx(expected[field])


async def test_guest_checkout_cannot_claim_existing_account(
    client, admin_token, auth_headers, client_user, session
):
    """Knowing an email must not be enough to mutate its account or create orders for it."""
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    original = {
        "company_name": client_user.company_name,
        "contact_name": client_user.contact_name,
        "phone": client_user.phone,
        "inn": client_user.inn,
        "address": client_user.address,
    }
    client_user_id = client_user.id
    body = {
        "email": client_user.email,
        "company_name": "Attacker LLC",
        "contact_name": "Mallory",
        "phone": "+10000000000",
        "inn": "1234567890",
        "delivery_address": "Attacker address",
        "items": [
            {
                "variant_id": variant_id,
                "sku": "TL-CL-W-50",
                "product_name": "Tea light",
                "pieces_per_box": 100,
                "boxes": 1,
                "unit_price": 14.5,
            }
        ],
    }

    response = await client.post("/orders", json=body)

    assert response.status_code == 409, response.text
    assert "Войдите" in response.json()["detail"]

    from sqlalchemy import func, select

    from app.models.order import Order
    from app.models.user import User

    session.expire_all()
    persisted_user = await session.scalar(select(User).where(User.id == client_user_id))
    assert persisted_user is not None
    assert {
        "company_name": persisted_user.company_name,
        "contact_name": persisted_user.contact_name,
        "phone": persisted_user.phone,
        "inn": persisted_user.inn,
        "address": persisted_user.address,
    } == original
    order_count = await session.scalar(
        select(func.count()).select_from(Order).where(Order.user_id == client_user.id)
    )
    assert order_count == 0


async def test_invalid_bearer_tokens_are_not_downgraded_to_guest(
    client, admin_token, auth_headers, session
):
    from sqlalchemy import select

    from app.core.security import create_refresh_token
    from app.models.user import User

    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    body = {
        "email": "should-not-exist@test.local",
        "contact_name": "Anonymous",
        "items": [{"variant_id": variant_id, "boxes": 1}],
    }
    expired_access = jwt.encode(
        {
            "sub": "11111111-1111-1111-1111-111111111111",
            "type": "access",
            "exp": datetime.now(UTC) - timedelta(minutes=1),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    invalid_tokens = (
        "not-a-jwt",
        expired_access,
        create_refresh_token("11111111-1111-1111-1111-111111111111"),
    )

    for token in invalid_tokens:
        response = await client.post(
            "/orders",
            json=body,
            headers=auth_headers(token),
        )
        assert response.status_code == 401, response.text
        assert response.headers["www-authenticate"] == "Bearer"

    guest = await session.scalar(select(User).where(User.email == "should-not-exist@test.local"))
    assert guest is None
    variant = await _get_variant_state(session, variant_id)
    assert variant.reserved_boxes == 0


async def test_disabled_user_bearer_is_not_downgraded_to_guest(
    client, client_user, client_token, auth_headers, session
):
    client_user.is_active = False
    await session.commit()

    response = await client.post(
        "/orders",
        json={
            "email": "disabled-fallback@test.local",
            "contact_name": "Disabled",
            "items": [
                {
                    "variant_id": "11111111-1111-1111-1111-111111111111",
                    "boxes": 1,
                }
            ],
        },
        headers=auth_headers(client_token),
    )

    assert response.status_code == 401, response.text
    assert response.json()["detail"] == "user not found or disabled"


async def test_create_order_rejects_when_stock_insufficient(
    client, admin_token, client_token, auth_headers
):
    """POST /orders должен вернуть 409, если хотя бы одной позиции не хватает
    на складе. Сейчас вариант посеян с 50 коробками — заказываем 51 и ждём
    отказа со структурой `out_of_stock` в detail."""
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    body = {
        "currency": "RUB",
        "items": [
            {
                "variant_id": variant_id,
                "sku": "TL-CL-W-50",
                "product_name": "Чайная",
                "variant_label": "Белый",
                "pieces_per_box": 100,
                "boxes": 51,
                "unit_price": 14.5,
            }
        ],
    }
    resp = await client.post("/orders", json=body, headers=auth_headers(client_token))
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert "Недостаточно товара" in detail["message"]
    assert detail["out_of_stock"][0]["sku"] == "TL-CL-W-50"
    assert detail["out_of_stock"][0]["requested_boxes"] == 51
    assert detail["out_of_stock"][0]["available_boxes"] == 50
    assert detail["out_of_stock"][0]["reason"] == "insufficient_stock"

    # Заказ не должен быть создан — список заказов пользователя пуст.
    listed = await client.get("/orders", headers=auth_headers(client_token))
    assert listed.status_code == 200
    assert listed.json() == []


async def test_my_orders_isolated_per_user(client, client_token, admin_token, auth_headers):
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
    own = await client.post("/orders", json={"items": [item]}, headers=auth_headers(client_token))
    own_id = own.json()["id"]

    # a second user must not see the first user's orders
    reg = await client.post(
        "/auth/register",
        json={"email": "peeper@x.com", "password": "Pwpwpw123"},
    )
    other_token = reg.cookies.get("cwh_access")
    assert other_token

    listed = await client.get("/orders", headers=auth_headers(other_token))
    assert listed.status_code == 200
    assert listed.json() == []

    fetched = await client.get(f"/orders/{own_id}", headers=auth_headers(other_token))
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


# ---------------------------------------------------------------------------
# CRITICAL #1 — server must canonicalise unit_price / pieces_per_box from
# product_variants and IGNORE whatever the client sends. Otherwise a
# malicious client can POST `unit_price=0.01` and buy the warehouse for free.
# ---------------------------------------------------------------------------


async def test_create_order_ignores_client_unit_price(
    client, admin_token, client_token, auth_headers
):
    """Client sends unit_price=0.01 but server must use 14.5 from the variant."""
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    body = {
        "currency": "RUB",
        "items": [
            {
                "variant_id": variant_id,
                "sku": "TL-CL-W-50",
                "product_name": "пытаюсь подменить",
                "variant_label": "fake",
                "pieces_per_box": 100,
                "boxes": 5,
                "unit_price": 0.01,  # ← attempted tampering
            }
        ],
    }
    resp = await client.post("/orders", json=body, headers=auth_headers(client_token))
    assert resp.status_code == 201, resp.text
    data = resp.json()

    # Server-side canonical price wins.
    assert data["items"][0]["unit_price"] == pytest.approx(14.5)
    # 14.5 * 100 * 5 = 7250, no discount tier seeded.
    assert data["subtotal"] == pytest.approx(7250.0)
    assert data["total"] == pytest.approx(7250.0)
    assert data["items"][0]["line_total"] == pytest.approx(7250.0)
    # Snapshot product_name comes from the DB, not the tampered string.
    assert data["items"][0]["product_name"] == "Чайная"


@pytest.mark.parametrize("include_null", [False, True])
@pytest.mark.parametrize("endpoint", ["/orders", "/orders/quote"])
async def test_priced_request_rejects_item_without_variant(
    client, client_token, auth_headers, include_null, endpoint
):
    item = {
        "sku": "FAKE-SKU",
        "product_name": "Client controlled product",
        "pieces_per_box": 100,
        "boxes": 10,
        "unit_price": 0,
    }
    if include_null:
        item["variant_id"] = None

    response = await client.post(
        endpoint,
        json={"currency": "RUB", "items": [item]},
        headers=auth_headers(client_token),
    )

    assert response.status_code == 422, response.text


async def test_create_order_ignores_client_pieces_per_box(
    client, admin_token, client_token, auth_headers
):
    """Even if client lies about pieces_per_box, server uses the variant's value."""
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    body = {
        "currency": "RUB",
        "items": [
            {
                "variant_id": variant_id,
                "sku": "TL-CL-W-50",
                "product_name": "Чайная",
                "pieces_per_box": 1,  # ← attempted tampering (real: 100)
                "boxes": 2,
                "unit_price": 14.5,
            }
        ],
    }
    resp = await client.post("/orders", json=body, headers=auth_headers(client_token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["items"][0]["pieces_per_box"] == 100
    # 14.5 * 100 * 2 = 2900
    assert data["subtotal"] == pytest.approx(2900.0)


# ---------------------------------------------------------------------------
# CRITICAL #3 — reservation lifecycle: reserve on create, release on cancel,
# ship (decrement stock + write StockMovement) on mark-ready.
# ---------------------------------------------------------------------------


async def test_create_order_reserves_boxes(
    client, admin_token, client_token, auth_headers, session
):
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)

    body = {
        "currency": "RUB",
        "items": [
            {
                "variant_id": variant_id,
                "sku": "TL-CL-W-50",
                "product_name": "Чайная",
                "pieces_per_box": 100,
                "boxes": 7,
                "unit_price": 14.5,
            }
        ],
    }
    resp = await client.post("/orders", json=body, headers=auth_headers(client_token))
    assert resp.status_code == 201, resp.text

    v = await _get_variant_state(session, variant_id)
    assert v.stock_boxes == 50  # not yet shipped
    assert v.reserved_boxes == 7  # boxes are reserved


async def test_reject_order_releases_reservation(
    client, admin_token, client_token, auth_headers, session
):
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    created = await client.post(
        "/orders",
        json={
            "currency": "RUB",
            "items": [
                {
                    "variant_id": variant_id,
                    "sku": "TL-CL-W-50",
                    "product_name": "Чайная",
                    "pieces_per_box": 100,
                    "boxes": 4,
                    "unit_price": 14.5,
                }
            ],
        },
        headers=auth_headers(client_token),
    )
    order_id = created.json()["id"]

    # Reserved before reject
    v = await _get_variant_state(session, variant_id)
    assert v.reserved_boxes == 4

    # Admin rejects with a reason
    rej = await client.post(
        f"/admin/orders/{order_id}/reject",
        json={"reason": "склад временно закрыт"},
        headers=auth_headers(admin_token),
    )
    assert rej.status_code == 200, rej.text
    assert rej.json()["new_status"] == "cancelled"

    # Reservation released back into the available pool
    v = await _get_variant_state(session, variant_id)
    assert v.stock_boxes == 50
    assert v.reserved_boxes == 0


async def test_patch_to_cancelled_releases_reservation(
    client, admin_token, client_token, auth_headers, session
):
    """Admin uses PATCH /admin/orders/{id} (not /reject) to cancel — stock must
    still be released. Otherwise reservations leak when admins use the wrong
    endpoint.
    """
    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    created = await client.post(
        "/orders",
        json={
            "currency": "RUB",
            "items": [
                {
                    "variant_id": variant_id,
                    "sku": "TL-CL-W-50",
                    "product_name": "Чайная",
                    "pieces_per_box": 100,
                    "boxes": 3,
                    "unit_price": 14.5,
                }
            ],
        },
        headers=auth_headers(client_token),
    )
    order_id = created.json()["id"]

    patched = await client.patch(
        f"/admin/orders/{order_id}",
        json={"status": "cancelled", "admin_comment": "manual cancel"},
        headers=auth_headers(admin_token),
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["status"] == "cancelled"

    v = await _get_variant_state(session, variant_id)
    assert v.reserved_boxes == 0
    assert v.stock_boxes == 50


async def test_mark_ready_decrements_stock_and_writes_movement(
    client, admin_token, client_token, auth_headers, session
):
    from sqlalchemy import select

    from app.models.stock import StockMovement

    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    created = await client.post(
        "/orders",
        json={
            "currency": "RUB",
            "items": [
                {
                    "variant_id": variant_id,
                    "sku": "TL-CL-W-50",
                    "product_name": "Чайная",
                    "pieces_per_box": 100,
                    "boxes": 6,
                    "unit_price": 14.5,
                }
            ],
        },
        headers=auth_headers(client_token),
    )
    order_id = created.json()["id"]

    # Walk through the workflow: new → processing → awaiting_payment →
    # payment_review (uploadless shortcut) → paid → shipped.
    # We use the named endpoints to honour the existing transition guards.
    assert (
        await client.post(f"/admin/orders/{order_id}/approve", headers=auth_headers(admin_token))
    ).status_code == 200
    # awaiting_payment → payment_review is a legal transition in the
    # state machine, so the catch-all PATCH endpoint accepts it.
    assert (
        await client.patch(
            f"/admin/orders/{order_id}",
            json={"status": "payment_review"},
            headers=auth_headers(admin_token),
        )
    ).status_code == 200
    assert (
        await client.post(
            f"/admin/orders/{order_id}/confirm-payment", headers=auth_headers(admin_token)
        )
    ).status_code == 200

    # Mark ready → ship — this is the inventory-decrementing step.
    ready = await client.post(
        f"/admin/orders/{order_id}/mark-ready", headers=auth_headers(admin_token)
    )
    assert ready.status_code == 200, ready.text

    v = await _get_variant_state(session, variant_id)
    assert v.stock_boxes == 50 - 6
    assert v.reserved_boxes == 0

    # Audit trail row was written for the shipment.
    movements = (
        await session.scalars(
            select(StockMovement).where(StockMovement.variant_id == UUID(variant_id))
        )
    ).all()
    out_rows = [m for m in movements if m.type.value == "out" and m.source == "order"]
    assert len(out_rows) == 1
    assert out_rows[0].qty_boxes == -6


@_requires_row_locks
async def test_concurrent_mark_ready_ships_order_exactly_once(
    client, admin_token, client_token, auth_headers, session
):
    """Concurrent retries must not duplicate stock or audit side effects."""
    from sqlalchemy import func, select

    from app.models.enums import OrderStatus, StockMovementType
    from app.models.order import OrderStatusHistory
    from app.models.stock import StockMovement

    variant_id = await _seed_product_and_variant(client, admin_token, auth_headers)
    created = await client.post(
        "/orders",
        json={
            "currency": "RUB",
            "items": [
                {
                    "variant_id": variant_id,
                    "sku": "TL-CL-W-50",
                    "product_name": "Tea light",
                    "pieces_per_box": 100,
                    "boxes": 6,
                    "unit_price": 14.5,
                }
            ],
        },
        headers=auth_headers(client_token),
    )
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    admin_headers = auth_headers(admin_token)

    assert (
        await client.post(f"/admin/orders/{order_id}/approve", headers=admin_headers)
    ).status_code == 200
    assert (
        await client.patch(
            f"/admin/orders/{order_id}",
            json={"status": "payment_review"},
            headers=admin_headers,
        )
    ).status_code == 200
    assert (
        await client.post(f"/admin/orders/{order_id}/confirm-payment", headers=admin_headers)
    ).status_code == 200

    responses = await asyncio.gather(
        *[
            client.post(f"/admin/orders/{order_id}/mark-ready", headers=admin_headers)
            for _ in range(2)
        ]
    )
    assert [response.status_code for response in responses] == [200, 200]

    variant = await _get_variant_state(session, variant_id)
    assert variant.stock_boxes == 44
    assert variant.reserved_boxes == 0

    movement_count = await session.scalar(
        select(func.count())
        .select_from(StockMovement)
        .where(
            StockMovement.variant_id == UUID(variant_id),
            StockMovement.type == StockMovementType.out,
            StockMovement.source == "order",
        )
    )
    shipped_history_count = await session.scalar(
        select(func.count())
        .select_from(OrderStatusHistory)
        .where(
            OrderStatusHistory.order_id == UUID(order_id),
            OrderStatusHistory.status == OrderStatus.shipped,
        )
    )
    assert movement_count == 1
    assert shipped_history_count == 1


@_requires_row_locks
async def test_concurrent_orders_do_not_oversell(
    client, admin_token, client_token, auth_headers, session
):
    """Five concurrent checkouts on a SKU with stock=3 must not over-sell.

    With `SELECT … FOR UPDATE` on the variant + reservation in the same
    transaction, Postgres serialises the lock-acquisitions; the second-onwards
    requests re-read the row under READ COMMITTED and see the freshly updated
    `reserved_boxes`. Exactly one request can succeed; the other four return
    409.
    """
    # Override the seeded variant to a small stock so we can stress-test it.
    prod = await client.post(
        "/admin/products",
        json={"slug": "tiny", "name_ru": "Малая", "name_en": "Tiny"},
        headers=auth_headers(admin_token),
    )
    var = await client.post(
        f"/admin/products/{prod.json()['id']}/variants",
        json={
            "sku": "TINY-1",
            "pieces_per_box": 10,
            "price_per_piece_rub": 1.0,
            "price_per_piece_usd": 1.0,
            "stock_boxes": 3,
        },
        headers=auth_headers(admin_token),
    )
    variant_id = var.json()["id"]

    body = {
        "currency": "RUB",
        "items": [
            {
                "variant_id": variant_id,
                "sku": "TINY-1",
                "product_name": "Малая",
                "pieces_per_box": 10,
                "boxes": 3,
                "unit_price": 1.0,
            }
        ],
    }
    headers = auth_headers(client_token)

    results = await asyncio.gather(
        *[client.post("/orders", json=body, headers=headers) for _ in range(5)],
        return_exceptions=True,
    )
    statuses = [r.status_code if hasattr(r, "status_code") else 500 for r in results]
    successes = sum(1 for s in statuses if s == 201)
    conflicts = sum(1 for s in statuses if s == 409)

    # Exactly one checkout wins; the rest must fail with 409 over-sold.
    assert successes == 1, f"unexpected status distribution: {statuses}"
    assert successes + conflicts == 5, f"unexpected status distribution: {statuses}"

    # Final stock state: 3 reserved, no over-sell.
    v = await _get_variant_state(session, variant_id)
    assert v.reserved_boxes == 3
    assert v.stock_boxes == 3
