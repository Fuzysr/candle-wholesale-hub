"""Regression tests for HIGH-priority security hardening.

Covers:

* HIGH #6 — `Settings` refuses to load `APP_ENV=production` with weak /
  placeholder secrets or wildcard CORS.
* HIGH #7 — inventory webhook uses `hmac.compare_digest` and rejects
  placeholder shared secrets.
* HIGH #10 — `/auth/password/reset-request` no longer logs the raw
  reset token; the user e-mail is hashed in INFO log records.
"""
from __future__ import annotations

import hashlib

import pytest

# IMPORTANT: NO module-level `pytestmark = pytest.mark.asyncio` here —
# the production-config tests in this file are pure sync and slapping
# the async marker on them just emits a warning per test.


# ---------------------------------------------------------------------------
# HIGH #6 — production guards
# ---------------------------------------------------------------------------


def _build_settings(**overrides):
    """Construct a fresh `Settings` instance with the given overrides.

    Imports are delayed because pytest collects this module before the
    project test environment defaults have fully populated `os.environ`,
    and we want to deterministically pass the overrides through the
    constructor regardless of the surrounding env.
    """
    from app.core.config import Settings

    base = {
        "app_env": "production",
        "jwt_secret": "x" * 64,
        "inventory_webhook_secret": "y" * 64,
        "cors_origins": ["https://shop.example.com"],
        "bootstrap_admin_email": "",
        "bootstrap_admin_password": "",
    }
    base.update(overrides)
    # `Settings` reads from env by default; we explicitly construct it from
    # kwargs so the test is independent of the host environment.
    return Settings(**base)


def test_production_settings_accept_strong_secrets():
    """Sanity check: a well-formed prod config loads without error."""
    s = _build_settings()
    assert s.app_env == "production"


@pytest.mark.parametrize(
    "weak",
    ["", "change-me", "REPLACE-ME", "secret", "password", "default", "test"],
)
def test_production_settings_reject_weak_jwt_secret(weak):
    with pytest.raises(ValueError, match="JWT_SECRET"):
        _build_settings(jwt_secret=weak)


def test_production_settings_reject_short_jwt_secret():
    with pytest.raises(ValueError, match="JWT_SECRET must be at least 32"):
        _build_settings(jwt_secret="x" * 16)


@pytest.mark.parametrize(
    "weak", ["replace-me", "change-me", "secret", "test"]
)
def test_production_settings_reject_weak_webhook_secret(weak):
    with pytest.raises(ValueError, match="INVENTORY_WEBHOOK_SECRET"):
        _build_settings(inventory_webhook_secret=weak)


def test_production_settings_reject_wildcard_cors():
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        _build_settings(cors_origins=["*"])


def test_production_settings_reject_empty_cors():
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        _build_settings(cors_origins=[])


def test_production_settings_reject_empty_bootstrap_password_when_email_set():
    with pytest.raises(ValueError, match="BOOTSTRAP_ADMIN_PASSWORD"):
        _build_settings(
            bootstrap_admin_email="root@example.com",
            bootstrap_admin_password="",
        )


def test_production_settings_reject_weak_bootstrap_password():
    with pytest.raises(ValueError, match="BOOTSTRAP_ADMIN_PASSWORD"):
        _build_settings(
            bootstrap_admin_email="root@example.com",
            bootstrap_admin_password="change-me",
        )


def test_development_settings_accept_weak_values():
    """In dev / test envs the operator is allowed to use placeholder
    secrets — fast iteration matters more than a hardened defaults check.
    """
    from app.core.config import Settings

    s = Settings(
        app_env="development",
        jwt_secret="change-me",
        inventory_webhook_secret="replace-me",
        cors_origins=["*"],
    )
    assert s.app_env == "development"


# ---------------------------------------------------------------------------
# HIGH #7 — inventory webhook authn hardening
# ---------------------------------------------------------------------------


# Minimal valid webhook body — the schema requires `updates` to be
# non-empty. The actual update is a no-op for unknown SKUs (matched=0,
# errors=["not found: ..."]), which is enough for our authn-only tests.
_WEBHOOK_BODY = {
    "updates": [{"sku": "NON-EXISTENT-SKU", "stock_boxes": 0}]
}


@pytest.mark.asyncio(loop_scope="session")
async def test_webhook_rejects_request_without_secret_header(client):
    resp = await client.post("/inventory/webhook", json=_WEBHOOK_BODY)
    assert resp.status_code == 401


@pytest.mark.asyncio(loop_scope="session")
async def test_webhook_rejects_wrong_secret(client):
    resp = await client.post(
        "/inventory/webhook",
        json=_WEBHOOK_BODY,
        headers={"x-webhook-secret": "wrong-value"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio(loop_scope="session")
async def test_webhook_rejects_placeholder_configured_secret(
    client, monkeypatch
):
    """Even if the caller presents the exact value, the server must
    refuse when the configured secret is a known placeholder. This is
    the «leaving the prod barn door wide open» guard.
    """
    from app.core.config import settings as app_settings

    monkeypatch.setattr(app_settings, "inventory_webhook_secret", "replace-me")
    resp = await client.post(
        "/inventory/webhook",
        json=_WEBHOOK_BODY,
        headers={"x-webhook-secret": "replace-me"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio(loop_scope="session")
async def test_webhook_accepts_correct_secret(client, monkeypatch):
    from app.core.config import settings as app_settings

    monkeypatch.setattr(
        app_settings, "inventory_webhook_secret", "very-secret-1234567890"
    )
    resp = await client.post(
        "/inventory/webhook",
        json=_WEBHOOK_BODY,
        headers={"x-webhook-secret": "very-secret-1234567890"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    # Unknown SKU → nothing matched, recorded as a soft error in the
    # response. The endpoint still authenticated successfully.
    assert body["matched"] == 0


@pytest.mark.asyncio(loop_scope="session")
async def test_webhook_rejects_almost_correct_secret(client, monkeypatch):
    """One-byte mismatch must still be a 401 — exercises the
    `compare_digest` branch."""
    from app.core.config import settings as app_settings

    monkeypatch.setattr(
        app_settings, "inventory_webhook_secret", "very-secret-1234567890"
    )
    resp = await client.post(
        "/inventory/webhook",
        json=_WEBHOOK_BODY,
        headers={"x-webhook-secret": "very-secret-1234567891"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# HIGH #10 — no raw reset-token / no raw email in logs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio(loop_scope="session")
async def test_password_reset_request_does_not_log_raw_token(
    client, client_user, monkeypatch
):
    """Before this fix the SMTP-not-configured path emitted the raw
    `secrets.token_urlsafe(32)` value at WARNING level — anyone with
    log access could take over any account at will. The log line
    must now contain only the user_tag (a SHA-256 prefix).

    We monkey-patch the auth router's logger so the test does NOT depend
    on whatever pytest plugins / handlers happen to be active. Whatever
    `logger.warning(...)` is called with goes into a list we then inspect
    for the forbidden values.
    """
    # Force the «SMTP not configured» branch so we exercise the WARNING
    # logger we want to inspect.
    from app.api.routers import auth as auth_module
    from app.core.config import settings as app_settings

    monkeypatch.setattr(app_settings, "smtp_host", "")

    captured: list[tuple[str, tuple, dict]] = []

    def _record(level: str):
        def _stub(msg, *args, **kwargs):
            captured.append((level, (msg,) + args, kwargs))
        return _stub

    monkeypatch.setattr(auth_module.logger, "warning", _record("warning"))
    monkeypatch.setattr(auth_module.logger, "info", _record("info"))
    monkeypatch.setattr(auth_module.logger, "error", _record("error"))

    resp = await client.post(
        "/auth/password/reset-request",
        json={"email": client_user.email},
    )
    assert resp.status_code == 200

    expected_tag = hashlib.sha256(
        client_user.email.lower().encode()
    ).hexdigest()[:12]

    assert captured, "auth router did not emit any log record"

    for _level, args, _kwargs in captured:
        # `args` is `(msg, *fmt_args)` — render once with %-formatting so
        # the assertion mirrors what would actually be written to a log
        # destination.
        msg_template, *fmt_args = args
        rendered = msg_template % tuple(fmt_args) if fmt_args else msg_template

        # Raw e-mail must NEVER appear in any log line emitted by this
        # endpoint, neither directly nor inside a format string.
        assert client_user.email not in rendered, (
            f"raw email leaked into log: {rendered!r}"
        )

        # And the body must absolutely not contain a raw token URL.
        assert "?token=" not in rendered
        assert "/reset-password?" not in rendered

    # The user_tag must show up at least once so ops can correlate the
    # warning line with a specific user without seeing the e-mail.
    rendered_all = "\n".join(
        (msg_template % tuple(fmt_args) if fmt_args else msg_template)
        for _level, (msg_template, *fmt_args), _ in (
            (lvl, args, kw) for lvl, args, kw in captured
        )
    )
    assert expected_tag in rendered_all, (
        f"user_tag not present in any log line: {rendered_all!r}"
    )


# ---------------------------------------------------------------------------
# HIGH #5 — security-headers middleware
# ---------------------------------------------------------------------------


@pytest.mark.asyncio(loop_scope="session")
async def test_health_endpoint_carries_security_headers(client):
    """Every response — even the trivial `/health` — gets the standard
    hardening headers attached by `SecurityHeadersMiddleware`.
    """
    resp = await client.get("/health")
    assert resp.status_code == 200

    h = resp.headers
    assert h["x-content-type-options"].lower() == "nosniff"
    assert h["x-frame-options"].upper() == "DENY"
    assert "strict-origin" in h["referrer-policy"].lower()
    assert "default-src 'none'" in h["content-security-policy"]
    assert "frame-ancestors 'none'" in h["content-security-policy"]
    # Permissions-Policy must lock down sensors / camera / etc.
    pp = h["permissions-policy"]
    for feature in ("camera=()", "geolocation=()", "microphone=()"):
        assert feature in pp, f"missing {feature} in permissions-policy"


@pytest.mark.asyncio(loop_scope="session")
async def test_hsts_not_emitted_in_test_environment(client):
    """HSTS would pin a developer's browser to HTTPS on `localhost`
    forever, breaking subsequent dev/test runs. It must therefore only
    fire when `APP_ENV=production`.
    """
    from app.core.config import settings as app_settings

    assert app_settings.app_env != "production"
    resp = await client.get("/health")
    assert "strict-transport-security" not in {
        k.lower() for k in resp.headers.keys()
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_security_headers_applied_to_404_too(client):
    """The middleware must run on every response, including errors —
    otherwise an attacker can probe an unmapped path and get a stripped
    response that bypasses our defences.
    """
    resp = await client.get("/this-path-does-not-exist-12345")
    assert resp.status_code == 404
    assert resp.headers["x-content-type-options"].lower() == "nosniff"
    assert resp.headers["x-frame-options"].upper() == "DENY"


# ---------------------------------------------------------------------------
# HIGH #2 — auth rate-limiting
# ---------------------------------------------------------------------------


def _enable_limiter(monkeypatch) -> None:
    """Flip slowapi's `enabled` on for the duration of one test.

    The limiter is constructed once at import time with
    `enabled=settings.rate_limit_enabled`, so flipping the setting is
    NOT enough — we must also poke the live `Limiter` instance.
    """
    from app.core import rate_limit as rl
    from app.core.config import settings as app_settings

    monkeypatch.setattr(app_settings, "rate_limit_enabled", True)
    monkeypatch.setattr(rl.limiter, "enabled", True)


def _isolated_ip(suffix: str) -> dict[str, str]:
    """Per-test client IP via `X-Forwarded-For`.

    The rate-limiter buckets by IP (extracted via `_client_key`), so a
    unique XFF per test guarantees we don't leak bucket state across
    tests in the same process — even though slowapi's in-memory storage
    is global.
    """
    return {"X-Forwarded-For": f"203.0.113.{suffix}"}


@pytest.mark.asyncio(loop_scope="session")
async def test_login_rate_limit_returns_429_after_burst(client, monkeypatch):
    """11 logins in a row from the same IP must trip the 10/minute
    bucket. The first 10 may legitimately return 401 (wrong credentials)
    but the 11th MUST be a 429.
    """
    _enable_limiter(monkeypatch)
    headers = _isolated_ip("10")

    # First 10 are processed normally — they return 401 (invalid creds)
    # because we use a non-existent account, but slowapi has counted
    # them.
    for _ in range(10):
        resp = await client.post(
            "/auth/login",
            headers=headers,
            json={"email": "rate-limit-probe@example.com", "password": "x" * 12},
        )
        assert resp.status_code in (401, 422), resp.text

    # The 11th request hits the limit.
    resp = await client.post(
        "/auth/login",
        headers=headers,
        json={"email": "rate-limit-probe@example.com", "password": "x" * 12},
    )
    assert resp.status_code == 429, resp.text
    assert "rate limit" in resp.json()["detail"].lower()
    assert resp.headers.get("Retry-After") == "60"


@pytest.mark.asyncio(loop_scope="session")
async def test_login_rate_limit_buckets_are_per_ip(client, monkeypatch):
    """Hitting the limit from IP A must NOT block IP B. Verifies the
    `key_func` is actually IP-based and not e.g. global.
    """
    _enable_limiter(monkeypatch)

    # Saturate the bucket for IP A.
    headers_a = _isolated_ip("11")
    for _ in range(11):
        await client.post(
            "/auth/login",
            headers=headers_a,
            json={"email": "a@example.com", "password": "x" * 12},
        )

    # IP B starts fresh.
    headers_b = _isolated_ip("12")
    resp = await client.post(
        "/auth/login",
        headers=headers_b,
        json={"email": "b@example.com", "password": "x" * 12},
    )
    assert resp.status_code != 429, (
        f"unrelated IP got rate-limited: {resp.status_code} {resp.text}"
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_password_reset_request_is_aggressively_rate_limited(
    client, monkeypatch
):
    """The password-reset bucket is the smallest because each call has
    real-world side effects (sends an e-mail, can be used to flood a
    third party's mailbox or amplify spam from our domain). Limit is
    3/min; 4th request must 429.
    """
    _enable_limiter(monkeypatch)
    headers = _isolated_ip("13")

    for _ in range(3):
        resp = await client.post(
            "/auth/password/reset-request",
            headers=headers,
            json={"email": "nobody@example.com"},
        )
        assert resp.status_code == 200

    resp = await client.post(
        "/auth/password/reset-request",
        headers=headers,
        json={"email": "nobody@example.com"},
    )
    assert resp.status_code == 429, resp.text


@pytest.mark.asyncio(loop_scope="session")
async def test_rate_limit_disabled_in_default_test_env(client):
    """Sanity check: with the default test config (rate_limit_enabled=
    False) we can hammer /auth/login without ever hitting 429.
    """
    headers = _isolated_ip("14")

    for _ in range(20):
        resp = await client.post(
            "/auth/login",
            headers=headers,
            json={"email": "x@example.com", "password": "x" * 12},
        )
        assert resp.status_code != 429, (
            "rate limit fired in test env — conftest must keep it disabled"
        )


# ---------------------------------------------------------------------------
# HIGH #4 — admin upload magic-byte sniffing
# ---------------------------------------------------------------------------


# A minimal but spec-valid 1x1 PNG: 8-byte magic + IHDR + IDAT + IEND.
# Built once and decoded into bytes via base64 to keep the source file
# free of binary blobs.
_MINIMAL_PNG = bytes.fromhex(
    "89504E470D0A1A0A"                           # magic
    "0000000D49484452"                           # IHDR len=13
    "00000001000000010806000000"                 # 1x1, RGBA, etc.
    "1F15C4890000000A49444154789C6300010000"     # IDAT
    "0500010D0A2DB40000000049454E44AE426082"     # IEND + CRC
)
# A minimal 1-byte JPEG SOI..EOI (this is not a valid decodable image
# but it has the right magic bytes and an EOI, which is all we need to
# trip the detector and the allowlist).
_MINIMAL_JPEG = bytes.fromhex(
    "FFD8FFE000104A46494600010100000100010000"   # SOI + APP0/JFIF
    + "FF" * 20                                  # filler
    + "FFD9"                                     # EOI
)
# Minimal RIFF/WEBP container header (12 bytes is the absolute minimum
# the detector inspects; a real image would be longer).
_MINIMAL_WEBP = b"RIFF\x10\x00\x00\x00WEBPVP8 "


def test_detect_image_mime_recognises_supported_formats():
    from app.api.routers.uploads import _detect_image_mime

    assert _detect_image_mime(_MINIMAL_PNG) == "image/png"
    assert _detect_image_mime(_MINIMAL_JPEG) == "image/jpeg"
    assert _detect_image_mime(_MINIMAL_WEBP) == "image/webp"


def test_detect_image_mime_rejects_html_payloads():
    """HTML / JS / SVG can be served as `image/png` if a browser
    chooses to sniff content. The detector must not be fooled by a
    `<html>` opening tag, BOM, or arbitrary text.
    """
    from app.api.routers.uploads import _detect_image_mime

    samples = [
        b"<html><body><script>alert(1)</script></body></html>",
        b"<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>",
        b"GIF89a\x01\x00\x01\x00\x00\xff\xff\xff",  # real GIF, but not allowed
        b"\x00" * 32,
        b"hello world without enough bytes",
    ]
    for sample in samples:
        assert _detect_image_mime(sample) is None, (
            f"unexpectedly detected as image: {sample[:16]!r}"
        )


def test_detect_image_mime_returns_none_for_too_small_input():
    from app.api.routers.uploads import _detect_image_mime

    # Less than 12 bytes — the detector cannot conclude anything safely.
    assert _detect_image_mime(b"\x89PNG") is None
    assert _detect_image_mime(b"") is None


@pytest.mark.asyncio(loop_scope="session")
async def test_upload_rejects_html_disguised_as_png(client, admin_token):
    """End-to-end: POST a `<html>...` body with `Content-Type: image/png`
    and confirm the endpoint refuses it. This is the actual attack we're
    defending against — without magic-byte validation this would land
    a `*.png` file in the publicly-served uploads dir and execute as HTML
    when served to a sniffing browser.
    """
    files = {
        "file": (
            "evil.png",
            b"<html><script>alert('xss')</script></html>",
            "image/png",
        )
    }
    resp = await client.post(
        "/admin/uploads/product-images",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400, resp.text
    assert "does not match" in resp.json()["detail"].lower() or (
        "supported image format" in resp.json()["detail"].lower()
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_upload_rejects_mime_type_mismatch(client, admin_token):
    """A real PNG body sent with `Content-Type: image/jpeg` must be
    rejected — the bytes and the header have to agree.
    """
    files = {"file": ("real.jpg", _MINIMAL_PNG, "image/jpeg")}
    resp = await client.post(
        "/admin/uploads/product-images",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400, resp.text
    assert "does not match" in resp.json()["detail"].lower()


@pytest.mark.asyncio(loop_scope="session")
async def test_upload_rejects_disallowed_format_even_with_correct_content_type(
    client, admin_token
):
    """A GIF is a real image format and a GIF body matched to
    `Content-Type: image/gif` would pass naive content/header equality
    checks. But the allowlist blocks it BEFORE we ever look at bytes.
    """
    gif_body = b"GIF89a\x01\x00\x01\x00\x00\xff\xff\xff" + b"\x00" * 16
    files = {"file": ("anim.gif", gif_body, "image/gif")}
    resp = await client.post(
        "/admin/uploads/product-images",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400, resp.text
    assert "unsupported content type" in resp.json()["detail"].lower()


@pytest.mark.asyncio(loop_scope="session")
async def test_upload_accepts_real_png(client, admin_token):
    """Happy path: a real PNG body with the correct Content-Type is saved
    to local storage and the endpoint returns its public URL.
    """
    files = {"file": ("ok.png", _MINIMAL_PNG, "image/png")}
    resp = await client.post(
        "/admin/uploads/product-images",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    url = resp.json()["url"]
    assert url.endswith(".png")
    assert "/uploads/product-images/" in url

    # The file must actually exist on disk and round-trip byte-for-byte.
    from app.core import storage
    from app.core.config import settings as app_settings

    key = url.rsplit("/", 1)[-1]
    saved = storage.local_path(app_settings.storage_category_products, key)
    assert saved.read_bytes() == _MINIMAL_PNG


# ---------------------------------------------------------------------------
# HIGH #3 — order status state-machine
# ---------------------------------------------------------------------------


def test_state_machine_terminal_states_have_no_outgoing_transitions():
    """`completed` and `cancelled` MUST be terminal — once an order is
    closed, the audit trail is locked. Any transition out of those
    states would let an admin (or attacker with admin token) re-open a
    refunded / fulfilled order and trigger fresh side effects."""
    from app.core.order_state_machine import ALLOWED_TRANSITIONS
    from app.models.enums import OrderStatus

    assert ALLOWED_TRANSITIONS[OrderStatus.completed] == frozenset()
    assert ALLOWED_TRANSITIONS[OrderStatus.cancelled] == frozenset()


@pytest.mark.parametrize(
    "current,target",
    [
        # Terminal states — nothing outgoing.
        ("cancelled", "new"),
        ("cancelled", "paid"),
        ("cancelled", "shipped"),
        ("completed", "new"),
        ("completed", "shipped"),
        ("completed", "cancelled"),
        # Skipping intermediate states.
        ("new", "shipped"),
        ("new", "completed"),
        ("new", "paid"),
        ("processing", "shipped"),
        ("awaiting_payment", "shipped"),
        # Backwards in inventory pipeline (not legal — would re-reserve).
        ("shipped", "paid"),
        ("shipped", "awaiting_payment"),
        ("shipped", "cancelled"),
        ("paid", "awaiting_payment"),
        ("paid", "new"),
    ],
)
def test_state_machine_rejects_illegal_transitions(current, target):
    from app.core.order_state_machine import is_transition_allowed
    from app.models.enums import OrderStatus

    assert not is_transition_allowed(
        OrderStatus(current), OrderStatus(target)
    ), f"{current} → {target} must be illegal but matrix accepts it"


@pytest.mark.parametrize(
    "current,target",
    [
        # The walk-forward happy path.
        ("new", "processing"),
        ("new", "awaiting_payment"),
        ("processing", "awaiting_payment"),
        ("awaiting_payment", "payment_review"),
        ("payment_review", "paid"),
        ("paid", "shipped"),
        ("shipped", "completed"),
        # Documented escape hatches.
        ("new", "cancelled"),
        ("processing", "cancelled"),
        ("awaiting_payment", "cancelled"),
        ("payment_review", "awaiting_payment"),  # bogus receipt
        ("paid", "cancelled"),
    ],
)
def test_state_machine_allows_documented_transitions(current, target):
    from app.core.order_state_machine import is_transition_allowed
    from app.models.enums import OrderStatus

    assert is_transition_allowed(
        OrderStatus(current), OrderStatus(target)
    ), f"{current} → {target} must be legal but matrix rejects it"


def test_state_machine_treats_same_status_as_noop():
    """Setting status=current is always allowed — it's a no-op and the
    router uses that to skip the inventory hooks."""
    from app.core.order_state_machine import is_transition_allowed
    from app.models.enums import OrderStatus

    for s in OrderStatus:
        assert is_transition_allowed(s, s) is True


def test_state_machine_assert_raises_409_on_illegal_transition():
    from fastapi import HTTPException

    from app.core.order_state_machine import assert_transition_allowed
    from app.models.enums import OrderStatus

    with pytest.raises(HTTPException) as info:
        assert_transition_allowed(OrderStatus.cancelled, OrderStatus.paid)
    assert info.value.status_code == 409
    # The message has to mention BOTH ends so the operator can tell
    # what they did wrong from the API response alone.
    detail = info.value.detail
    assert "cancelled" in detail
    # Terminal-state path triggers a slightly different message —
    # accept either wording so the test stays robust to copy edits.
    assert "терминальный" in detail or "paid" in detail


# ---------------------------------------------------------------------------
# HIGH #3 — integration: PATCH /admin/orders/{id} honours the matrix
# ---------------------------------------------------------------------------


async def _seed_minimal_order(client, admin_token, client_token, auth_headers):
    """Create a `new` order owned by the client_user, return its id.

    Helper duplicates a tiny subset of `tests/test_orders.py::_seed_*`
    so this test file stays self-contained — sharing the helper would
    require importing from another test module which pytest discourages.
    """
    prod = await client.post(
        "/admin/products",
        json={"slug": f"sm-{uuid_short()}", "name_ru": "X", "name_en": "X"},
        headers=auth_headers(admin_token),
    )
    pid = prod.json()["id"]
    var = await client.post(
        f"/admin/products/{pid}/variants",
        json={
            "sku": f"SM-{uuid_short()}",
            "color": "white",
            "pieces_per_box": 10,
            "price_per_piece_rub": 1.0,
            "price_per_piece_usd": 1.0,
            "stock_boxes": 50,
        },
        headers=auth_headers(admin_token),
    )
    variant_id = var.json()["id"]

    created = await client.post(
        "/orders",
        json={
            "currency": "RUB",
            "items": [{
                "variant_id": variant_id,
                "sku": var.json()["sku"],
                "product_name": "X",
                "color": "white",
                "boxes": 1,
                "pieces_per_box": 10,
                "unit_price": 1.0,
            }],
            "contact_name": "T",
            "phone": "+7",
            "email": "t@t.local",
        },
        headers=auth_headers(client_token),
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def uuid_short() -> str:
    """A short random suffix for product/variant slugs used in this file."""
    import uuid as _uuid

    return _uuid.uuid4().hex[:8]


@pytest.mark.asyncio(loop_scope="session")
async def test_patch_rejects_new_to_shipped(
    client, admin_token, client_token, auth_headers
):
    """new → shipped skips reservation/payment entirely. Must 409."""
    order_id = await _seed_minimal_order(
        client, admin_token, client_token, auth_headers
    )
    resp = await client.patch(
        f"/admin/orders/{order_id}",
        json={"status": "shipped"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"].lower()
    assert "new" in detail and "shipped" in detail


@pytest.mark.asyncio(loop_scope="session")
async def test_patch_rejects_terminal_state_change(
    client, admin_token, client_token, auth_headers
):
    """Once an order is `cancelled`, no further status change is OK."""
    order_id = await _seed_minimal_order(
        client, admin_token, client_token, auth_headers
    )
    # Step 1: legitimate cancel.
    cancel = await client.patch(
        f"/admin/orders/{order_id}",
        json={"status": "cancelled"},
        headers=auth_headers(admin_token),
    )
    assert cancel.status_code == 200, cancel.text

    # Step 2: any further mutation must 409.
    for forbidden in ("paid", "new", "shipped", "processing"):
        bad = await client.patch(
            f"/admin/orders/{order_id}",
            json={"status": forbidden},
            headers=auth_headers(admin_token),
        )
        assert bad.status_code == 409, (
            f"cancelled → {forbidden} should be 409, got {bad.status_code}: "
            f"{bad.text}"
        )
        assert "терминальный" in bad.json()["detail"].lower()


@pytest.mark.asyncio(loop_scope="session")
async def test_patch_no_op_same_status_is_allowed(
    client, admin_token, client_token, auth_headers
):
    """Sending `status=new` for an already-new order must succeed without
    writing a history row (the router short-circuits). Confirms the
    state-machine treats x→x as legal.
    """
    order_id = await _seed_minimal_order(
        client, admin_token, client_token, auth_headers
    )
    resp = await client.patch(
        f"/admin/orders/{order_id}",
        json={"status": "new"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "new"


@pytest.mark.asyncio(loop_scope="session")
async def test_patch_rejected_transition_does_not_release_reservation(
    client, admin_token, client_token, auth_headers, session
):
    """Critical: when the state machine refuses a `cancelled` PATCH on
    an already-shipped order, the inventory ledger must NOT have been
    touched. This is why `assert_transition_allowed` runs *before*
    `_release_reservation` in the router.

    We construct a `shipped` order via the canonical workflow, then try
    to PATCH it back to `cancelled` and verify the reservation/stock
    state is unchanged.
    """
    from sqlalchemy import select

    from app.models.catalog import ProductVariant

    order_id = await _seed_minimal_order(
        client, admin_token, client_token, auth_headers
    )

    # Walk the order to `shipped` via the legal path.
    assert (
        await client.post(
            f"/admin/orders/{order_id}/approve",
            headers=auth_headers(admin_token),
        )
    ).status_code == 200
    assert (
        await client.patch(
            f"/admin/orders/{order_id}",
            json={"status": "payment_review"},
            headers=auth_headers(admin_token),
        )
    ).status_code == 200
    assert (
        await client.post(
            f"/admin/orders/{order_id}/confirm-payment",
            headers=auth_headers(admin_token),
        )
    ).status_code == 200
    assert (
        await client.post(
            f"/admin/orders/{order_id}/mark-ready",
            headers=auth_headers(admin_token),
        )
    ).status_code == 200

    # Snapshot stock state right after shipment.
    variant = (await session.execute(select(ProductVariant))).scalars().first()
    assert variant is not None
    stock_after_ship = variant.stock_boxes
    reserved_after_ship = variant.reserved_boxes

    # Forbidden transition: shipped → cancelled.
    bad = await client.patch(
        f"/admin/orders/{order_id}",
        json={"status": "cancelled"},
        headers=auth_headers(admin_token),
    )
    assert bad.status_code == 409, bad.text

    # And the inventory ledger is untouched — no «ghost release» landed.
    await session.refresh(variant)
    assert variant.stock_boxes == stock_after_ship
    assert variant.reserved_boxes == reserved_after_ship


def test_security_headers_middleware_emits_hsts_in_production():
    """Direct, env-independent unit test of the middleware itself: when
    constructed with `enable_hsts=True` it stamps the HSTS header.

    We exercise the middleware via a tiny throwaway Starlette app so the
    test doesn't depend on global FastAPI app state.
    """
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    from app.core.middleware import SecurityHeadersMiddleware

    async def _handler(_request):
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/", _handler)])
    app.add_middleware(SecurityHeadersMiddleware, enable_hsts=True)

    with TestClient(app) as test_client:
        resp = test_client.get("/")

    assert resp.headers["strict-transport-security"].startswith(
        "max-age=31536000"
    )
    assert "includesubdomains" in resp.headers[
        "strict-transport-security"
    ].lower()
