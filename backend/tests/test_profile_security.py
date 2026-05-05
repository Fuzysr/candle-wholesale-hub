"""Tests for profile endpoint security (BUG-5 verification).

Ensures that:
- Users can update allowed profile fields
- Users CANNOT escalate privileges via profile update
- Authentication is required
"""
import pytest

pytestmark = pytest.mark.asyncio


async def test_profile_get_requires_auth(client):
    resp = await client.get("/profile")
    assert resp.status_code == 401


async def test_profile_get_returns_user_data(client, client_token, auth_headers):
    resp = await client.get("/profile", headers=auth_headers(client_token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "client@test.local"
    assert "password_hash" not in data


async def test_profile_update_allowed_fields(client, client_token, auth_headers):
    resp = await client.patch(
        "/profile",
        json={
            "company_name": "Updated Co",
            "contact_name": "Новое Имя",
            "phone": "+79991112233",
            "inn": "1234567890",
            "address": "ул. Тестовая, д.1",
        },
        headers=auth_headers(client_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["company_name"] == "Updated Co"
    assert data["contact_name"] == "Новое Имя"
    assert data["phone"] == "+79991112233"
    assert data["inn"] == "1234567890"
    assert data["address"] == "ул. Тестовая, д.1"


async def test_profile_update_ignores_role_field(client, client_token, auth_headers):
    """Users must NOT be able to escalate to admin via profile update."""
    resp = await client.patch(
        "/profile",
        json={"role": "admin", "company_name": "Hacker Co"},
        headers=auth_headers(client_token),
    )
    # Pydantic ignores unknown fields by default — the request succeeds
    # but role is unchanged.
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "client"
    assert data["is_admin"] is False


async def test_profile_update_ignores_email_field(client, client_token, auth_headers):
    """Users must NOT change their email via profile update."""
    resp = await client.patch(
        "/profile",
        json={"email": "hacker@evil.com", "company_name": "Test"},
        headers=auth_headers(client_token),
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "client@test.local"


async def test_profile_update_ignores_is_active_field(client, client_token, auth_headers):
    """Users must NOT be able to re-activate themselves."""
    resp = await client.patch(
        "/profile",
        json={"is_active": False},
        headers=auth_headers(client_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True


async def test_profile_update_partial(client, client_token, auth_headers):
    """Partial updates should only change specified fields."""
    # Set initial state
    await client.patch(
        "/profile",
        json={"company_name": "Keep This", "phone": "+70001111111"},
        headers=auth_headers(client_token),
    )

    # Update only phone
    resp = await client.patch(
        "/profile",
        json={"phone": "+70002222222"},
        headers=auth_headers(client_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["company_name"] == "Keep This"  # unchanged
    assert data["phone"] == "+70002222222"  # updated


async def test_profile_update_field_length_limits(client, client_token, auth_headers):
    """Fields with max_length constraints should reject overly long values."""
    resp = await client.patch(
        "/profile",
        json={"phone": "x" * 100},  # max_length=50
        headers=auth_headers(client_token),
    )
    assert resp.status_code == 422
