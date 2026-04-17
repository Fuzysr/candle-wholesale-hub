"""Auth endpoint smoke tests."""
import pytest

pytestmark = pytest.mark.asyncio


async def test_register_returns_tokens_and_user(client):
    resp = await client.post(
        "/auth/register",
        json={
            "email": "buyer@example.com",
            "password": "s3cret123",
            "company_name": "ACME",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["access"]
    assert data["refresh"]
    assert data["user"]["email"] == "buyer@example.com"
    assert data["user"]["role"] == "client"
    assert data["user"]["is_admin"] is False


async def test_register_duplicate_returns_409(client):
    payload = {"email": "dup@example.com", "password": "s3cret123"}
    assert (await client.post("/auth/register", json=payload)).status_code == 201
    dup = await client.post("/auth/register", json=payload)
    assert dup.status_code == 409


async def test_login_wrong_password(client):
    await client.post(
        "/auth/register", json={"email": "u1@example.com", "password": "correcthorse"}
    )
    resp = await client.post(
        "/auth/login", json={"email": "u1@example.com", "password": "wrong"}
    )
    assert resp.status_code == 401


async def test_me_requires_bearer(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_me_returns_authenticated_user(client, client_token, auth_headers):
    resp = await client.get("/auth/me", headers=auth_headers(client_token))
    assert resp.status_code == 200
    assert resp.json()["email"] == "client@test.local"


async def test_refresh_issues_new_access(client):
    register = await client.post(
        "/auth/register", json={"email": "rt@example.com", "password": "pw123456"}
    )
    refresh_token = register.json()["refresh"]
    resp = await client.post("/auth/refresh", json={"refresh": refresh_token})
    assert resp.status_code == 200
    assert resp.json()["access"]


async def test_refresh_rejects_access_token(client, client_token):
    resp = await client.post("/auth/refresh", json={"refresh": client_token})
    assert resp.status_code == 401
