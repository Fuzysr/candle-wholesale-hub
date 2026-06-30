from app.core import mfa


def test_totp_accepts_current_window_and_rejects_bad_code():
    secret = "JBSWY3DPEHPK3PXP"
    code = mfa._totp(secret, 1_700_000_000 // 30)
    assert mfa.verify_code(secret, code, now=1_700_000_000)
    assert not mfa.verify_code(secret, "000000", now=1_700_000_000)


def test_mfa_seed_is_encrypted_at_rest(monkeypatch):
    monkeypatch.setattr(
        mfa.settings,
        "mfa_encryption_key",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    )
    secret = mfa.generate_secret()
    encrypted = mfa.encrypt_secret(secret)
    assert encrypted != secret
    assert secret not in encrypted
    assert mfa.decrypt_secret(encrypted) == secret


def test_provisioning_uri_contains_no_password_or_token():
    uri = mfa.provisioning_uri("JBSWY3DPEHPK3PXP", "admin@example.com")
    assert uri.startswith("otpauth://totp/")
    assert "issuer=CANDWAX" in uri
    assert "secret=JBSWY3DPEHPK3PXP" in uri
