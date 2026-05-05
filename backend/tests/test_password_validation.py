"""Tests for password complexity validation (BUG-6 fix).

Ensures that both registration and password reset enforce:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
"""
import pytest

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Registration — password complexity
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "weak_password,reason",
    [
        ("short1A", "too short (7 chars)"),
        ("alllowercase1", "no uppercase letter"),
        ("ALLUPPERCASE1", "no lowercase letter"),
        ("NoDigitsHere", "no digit"),
        ("12345678", "no letters at all"),
        ("aB1", "way too short"),
        ("", "empty"),
    ],
)
async def test_register_rejects_weak_password(client, weak_password, reason):
    resp = await client.post(
        "/auth/register",
        json={"email": f"weak-{len(weak_password)}@example.com", "password": weak_password},
    )
    assert resp.status_code == 422, f"Expected 422 for {reason}, got {resp.status_code}: {resp.text}"


@pytest.mark.parametrize(
    "strong_password",
    [
        "StrongPw1",
        "MyP@ssw0rd",
        "abcDEF123",
        "A1bcdefgh",
        "x" * 60 + "A1b",  # long but valid
    ],
)
async def test_register_accepts_strong_password(client, strong_password):
    import uuid
    email = f"strong-{uuid.uuid4().hex[:8]}@example.com"
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": strong_password},
    )
    assert resp.status_code == 201, f"Expected 201 for valid password, got {resp.status_code}: {resp.text}"


# ---------------------------------------------------------------------------
# Password reset confirm — same complexity rules
# ---------------------------------------------------------------------------


async def test_reset_confirm_rejects_weak_password(client, client_user, session):
    """Password reset must enforce the same complexity rules as registration."""
    import hashlib
    from app.models.password_reset import PasswordReset

    raw_token = "complexity-test-token"
    session.add(
        PasswordReset(
            user_id=client_user.id,
            email=client_user.email,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
        )
    )
    await session.commit()

    resp = await client.post(
        "/auth/password/reset-confirm",
        json={"token": raw_token, "password": "weakpw"},
    )
    # Should be rejected by Pydantic validation (422)
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ---------------------------------------------------------------------------
# Login — no complexity check (users may have old passwords)
# ---------------------------------------------------------------------------


async def test_login_does_not_enforce_complexity(client):
    """Login must NOT reject weak passwords — users with old passwords
    need to be able to log in. Complexity is only for new passwords."""
    resp = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "weak"},
    )
    # Should be 401 (wrong creds), NOT 422 (validation error)
    assert resp.status_code == 401
