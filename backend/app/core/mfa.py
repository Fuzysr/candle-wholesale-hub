"""RFC 6238 TOTP helpers with encrypted-at-rest seeds."""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def generate_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _fernet() -> Fernet:
    key = settings.mfa_encryption_key.encode()
    if not key:
        raise RuntimeError("MFA_ENCRYPTION_KEY is not configured")
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("MFA secret cannot be decrypted") from exc


def _totp(secret: str, counter: int) -> str:
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{value:06d}"


def verify_code(secret: str, code: str, *, now: int | None = None) -> bool:
    if len(code) != 6 or not code.isdigit():
        return False
    counter = (int(time.time()) if now is None else now) // 30
    return any(hmac.compare_digest(_totp(secret, counter + drift), code) for drift in (-1, 0, 1))


def provisioning_uri(secret: str, email: str) -> str:
    label = quote(f"CANDWAX:{email}", safe="")
    query = urlencode({"secret": secret, "issuer": "CANDWAX", "algorithm": "SHA1", "digits": 6, "period": 30})
    return f"otpauth://totp/{label}?{query}"
