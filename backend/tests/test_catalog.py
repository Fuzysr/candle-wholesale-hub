"""Catalog endpoint smoke tests."""
import pytest

pytestmark = pytest.mark.asyncio


async def test_attribute_lookups_seeded_by_migration(client):
    for kind in ("materials", "scents", "shapes"):
        resp = await client.get(f"/attributes/{kind}")
        assert resp.status_code == 200, resp.text
        items = resp.json()
        assert len(items) >= 3, f"expected seed rows for {kind}, got {items}"
        assert all("slug" in i and "name_ru" in i for i in items)


async def test_public_products_lists_only_published(client, admin_token, auth_headers):
    # Admin creates a category + two products: one published, one draft.
    cat = await client.post(
        "/admin/categories",
        json={"slug": "tea-lights", "name_ru": "Чайные", "name_en": "Tea lights"},
        headers=auth_headers(admin_token),
    )
    assert cat.status_code == 201, cat.text
    category_id = cat.json()["id"]

    for slug, published in (("visible", True), ("draft", False)):
        r = await client.post(
            "/admin/products",
            json={
                "slug": slug,
                "category_id": category_id,
                "name_ru": slug,
                "name_en": slug,
                "is_published": published,
            },
            headers=auth_headers(admin_token),
        )
        assert r.status_code == 201, r.text

    public = await client.get("/products")
    assert public.status_code == 200
    slugs_public = {p["slug"] for p in public.json()}
    assert "visible" in slugs_public
    assert "draft" not in slugs_public

    admin = await client.get("/admin/products", headers=auth_headers(admin_token))
    assert admin.status_code == 200
    slugs_admin = {p["slug"] for p in admin.json()}
    assert slugs_admin == {"visible", "draft"}


async def test_product_slug_lookup_returns_nested_relations(
    client, admin_token, auth_headers
):
    prod = await client.post(
        "/admin/products",
        json={"slug": "pillar-iv", "name_ru": "Столбовая", "name_en": "Pillar"},
        headers=auth_headers(admin_token),
    )
    product_id = prod.json()["id"]

    var = await client.post(
        f"/admin/products/{product_id}/variants",
        json={
            "sku": "PL-IV-70",
            "pieces_per_box": 6,
            "price_per_piece_rub": 420,
            "price_per_piece_usd": 4.6,
            "stock_boxes": 10,
        },
        headers=auth_headers(admin_token),
    )
    assert var.status_code == 201, var.text

    detail = await client.get("/products/pillar-iv")
    assert detail.status_code == 200
    body = detail.json()
    assert len(body["variants"]) == 1
    assert body["variants"][0]["sku"] == "PL-IV-70"


async def test_non_admin_cannot_write_catalog(client, client_token, auth_headers):
    r = await client.post(
        "/admin/categories",
        json={"slug": "x", "name_ru": "x", "name_en": "x"},
        headers=auth_headers(client_token),
    )
    assert r.status_code == 403


async def test_discount_tiers_listable_and_admin_crud(
    client, admin_token, auth_headers
):
    created = await client.post(
        "/admin/discount-tiers",
        json={"min_boxes": 10, "discount_percent": 5},
        headers=auth_headers(admin_token),
    )
    assert created.status_code == 201
    tier_id = created.json()["id"]

    listed = await client.get("/discount-tiers")
    assert listed.status_code == 200
    assert any(t["id"] == tier_id for t in listed.json())

    deleted = await client.delete(
        f"/admin/discount-tiers/{tier_id}", headers=auth_headers(admin_token)
    )
    assert deleted.status_code == 204
