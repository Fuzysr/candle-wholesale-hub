"""Auth endpoint smoke tests."""

import pytest

pytestmark = pytest.mark.asyncio


async def test_register_returns_tokens_and_user(client):
    resp = await client.post(
        "/auth/register",
        json={
            "email": "buyer@example.com",
            "password": "S3cret123",
            "company_name": "ACME",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert "access" not in data
    assert "refresh" not in data
    assert resp.cookies.get("cwh_access")
    assert resp.cookies.get("cwh_refresh")
    assert data["user"]["email"] == "buyer@example.com"
    assert data["user"]["role"] == "client"
    assert data["user"]["is_admin"] is False


async def test_auth_cookies_are_hardened_and_cookie_auth_works(client):
    registered = await client.post(
        "/auth/register",
        json={"email": "cookie@example.com", "password": "S3cret123"},
    )
    set_cookies = registered.headers.get_list("set-cookie")
    access = next(value for value in set_cookies if value.startswith("cwh_access="))
    refresh = next(value for value in set_cookies if value.startswith("cwh_refresh="))

    assert "HttpOnly" in access and "SameSite=lax" in access
    assert "Path=/" in access
    assert "HttpOnly" in refresh and "SameSite=lax" in refresh
    assert "Path=/auth" in refresh

    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "cookie@example.com"


async def test_cookie_auth_mutation_requires_matching_csrf_token(client):
    await client.post(
        "/auth/register",
        json={"email": "csrf@example.com", "password": "S3cret123"},
    )

    rejected = await client.post(
        "/auth/logout",
        json={},
        headers={"Origin": "http://localhost:5173"},
    )
    assert rejected.status_code == 403
    assert rejected.json()["detail"] == "CSRF validation failed"

    csrf = client.cookies.get("cwh_csrf")
    assert csrf
    accepted = await client.post(
        "/auth/logout",
        json={},
        headers={
            "Origin": "http://localhost:5173",
            "X-CSRF-Token": csrf,
        },
    )
    assert accepted.status_code == 204


async def test_register_duplicate_returns_409(client):
    payload = {"email": "dup@example.com", "password": "S3cret123"}
    assert (await client.post("/auth/register", json=payload)).status_code == 201
    dup = await client.post("/auth/register", json=payload)
    assert dup.status_code == 409


async def test_login_wrong_password(client):
    await client.post(
        "/auth/register", json={"email": "u1@example.com", "password": "CorrectHorse1"}
    )
    resp = await client.post("/auth/login", json={"email": "u1@example.com", "password": "wrong"})
    assert resp.status_code == 401


async def test_me_requires_authentication(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_me_returns_authenticated_user(client, client_token, auth_headers):
    resp = await client.get("/auth/me", headers=auth_headers(client_token))
    assert resp.status_code == 200
    assert resp.json()["email"] == "client@test.local"


async def test_refresh_issues_new_access(client):
    register = await client.post(
        "/auth/register", json={"email": "rt@example.com", "password": "Pw123456x"}
    )
    refresh_token = register.cookies.get("cwh_refresh")
    assert refresh_token
    csrf = client.cookies.get("cwh_csrf")
    assert csrf
    resp = await client.post(
        "/auth/refresh",
        json={"refresh": refresh_token},
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert resp.cookies.get("cwh_access")


async def test_refresh_rejects_access_token(client, client_token):
    resp = await client.post("/auth/refresh", json={"refresh": client_token})
    assert resp.status_code == 401
