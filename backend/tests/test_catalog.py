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


async def test_product_pagination_has_a_stable_unique_order(
    client, admin_token, auth_headers
):
    created_ids = []
    for index in range(3):
        created = await client.post(
            "/admin/products",
            json={
                "slug": f"same-name-{index}",
                "name_ru": "Same name",
                "name_en": "Same name",
            },
            headers=auth_headers(admin_token),
        )
        assert created.status_code == 201, created.text
        created_ids.append(created.json()["id"])

    page_ids = []
    for offset in range(3):
        page = await client.get(
            "/admin/products",
            params={"offset": offset, "limit": 1},
            headers=auth_headers(admin_token),
        )
        assert page.status_code == 200, page.text
        page_ids.append(page.json()[0]["id"])

    assert page_ids == sorted(created_ids)
    assert len(set(page_ids)) == 3


async def test_product_search_filters_and_returns_page_metadata(
    client, admin_token, auth_headers
):
    headers = auth_headers(admin_token)
    category = await client.post(
        "/admin/categories",
        json={"slug": "filtered", "name_ru": "Filtered", "name_en": "Filtered"},
        headers=headers,
    )
    category_id = category.json()["id"]

    product_ids = []
    for index in range(3):
        product = await client.post(
            "/admin/products",
            json={
                "slug": f"searchable-{index}",
                "category_id": category_id,
                "name_ru": f"Searchable {index}",
                "name_en": f"Searchable {index}",
            },
            headers=headers,
        )
        assert product.status_code == 201, product.text
        product_ids.append(product.json()["id"])
        variant = await client.post(
            f"/admin/products/{product.json()['id']}/variants",
            json={
                "sku": f"FILTER-SKU-{index}",
                "pieces_per_box": 2,
                "price_per_piece_rub": 100 + index,
                "price_per_piece_usd": 2 + index,
                "stock_boxes": 5 if index == 1 else 0,
                "color": "ivory" if index == 1 else "white",
                "length_mm": 100 + index * 10,
            },
            headers=headers,
        )
        assert variant.status_code == 201, variant.text

    first = await client.get(
        "/products/search",
        params={
            "category_ids": category_id,
            "q": "filter-sku",
            "page": 1,
            "page_size": 2,
            "sort": "name",
        },
    )
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["pages"] == 2
    assert body["has_next"] is True
    assert body["has_previous"] is False
    assert [item["id"] for item in body["items"]] == product_ids[:2]

    second = await client.get(
        "/products/search",
        params={"category_ids": category_id, "page": 2, "page_size": 2, "sort": "name"},
    )
    assert second.status_code == 200, second.text
    assert [item["id"] for item in second.json()["items"]] == product_ids[2:]
    assert second.json()["has_previous"] is True
    assert second.json()["has_next"] is False

    in_stock = await client.get(
        "/products/search",
        params={"category_ids": category_id, "in_stock": True},
    )
    assert in_stock.status_code == 200, in_stock.text
    assert [item["slug"] for item in in_stock.json()["items"]] == ["searchable-1"]

    variant_filtered = await client.get(
        "/products/search",
        params={
            "category_ids": category_id,
            "colors": "ivory",
            "price_min": 200,
            "price_max": 202,
            "length_min": 110,
            "length_max": 110,
            "currency": "RUB",
        },
    )
    assert variant_filtered.status_code == 200, variant_filtered.text
    assert variant_filtered.json()["total"] == 1
    assert [item["slug"] for item in variant_filtered.json()["items"]] == [
        "searchable-1"
    ]

    colors = await client.get("/products/colors")
    assert colors.status_code == 200, colors.text
    assert colors.json() == ["ivory", "white"]


async def test_product_search_rejects_invalid_pagination(client):
    response = await client.get("/products/search", params={"page": 0, "page_size": 201})
    assert response.status_code == 422


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


async def test_only_five_categories_can_be_shown_on_home(
    client, admin_token, auth_headers
):
    headers = auth_headers(admin_token)
    for index in range(5):
        response = await client.post(
            "/admin/categories",
            json={
                "slug": f"home-category-{index}",
                "name_ru": f"Home category {index}",
                "name_en": f"Home category {index}",
                "show_on_home": True,
            },
            headers=headers,
        )
        assert response.status_code == 201, response.text

    rejected = await client.post(
        "/admin/categories",
        json={
            "slug": "home-category-six",
            "name_ru": "Home category six",
            "name_en": "Home category six",
            "show_on_home": True,
        },
        headers=headers,
    )
    assert rejected.status_code == 422
    assert "five" in rejected.json()["detail"]


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
