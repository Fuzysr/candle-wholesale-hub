"""Thin async wrapper around boto3 for MinIO / S3-compatible storage.

Design choices:

* we use **sync** boto3 under `asyncio.to_thread` instead of aiobotocore to keep
  the dependency footprint small and because uploads are not a hot path
* buckets are created lazily on first use; **public** buckets are made
  world-readable, **private** buckets explicitly have any anonymous-GET
  policy stripped (see `ensure_bucket(public_read=False)`)
* public URLs are constructed as `{S3_PUBLIC_URL_BASE}/{bucket}/{key}` which
  matches MinIO's default path-style routing and also works behind a CDN
* private objects (e.g. payment receipts) are served via short-lived
  presigned URLs — see :func:`presigned_get_url`
"""
from __future__ import annotations

import asyncio
import json
import uuid
from functools import lru_cache
from urllib.parse import urlparse

import boto3
from botocore.client import BaseClient, Config
from botocore.exceptions import ClientError

from app.core.config import settings


@lru_cache(maxsize=1)
def _get_s3() -> BaseClient:
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


# Cache of (bucket_name, public_read) pairs we've already provisioned during
# the lifetime of this process so we don't keep re-issuing head/create/policy
# calls on every upload.
_ENSURED_BUCKETS: set[tuple[str, bool]] = set()


def _ensure_bucket_sync(bucket: str, *, public_read: bool) -> None:
    if (bucket, public_read) in _ENSURED_BUCKETS:
        return
    s3 = _get_s3()
    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError:
        try:
            s3.create_bucket(Bucket=bucket)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") not in {
                "BucketAlreadyOwnedByYou",
                "BucketAlreadyExists",
            }:
                raise

    if public_read:
        # Allow anonymous GET so the frontend can display images directly.
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{bucket}/*"],
                }
            ],
        }
        try:
            s3.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))
        except ClientError:
            # Non-fatal: the bucket works even without a public policy when the
            # frontend fetches via presigned URLs. Keep going.
            pass
    else:
        # Private bucket: make absolutely sure no anonymous-GET policy is
        # left over from a previous deploy (e.g. when the bucket used to be
        # public). `delete_bucket_policy` is idempotent on MinIO/S3 — if no
        # policy exists it returns NoSuchBucketPolicy, which we swallow.
        try:
            s3.delete_bucket_policy(Bucket=bucket)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") not in {
                "NoSuchBucketPolicy",
                "BucketPolicyNotFound",
            }:
                raise

    _ENSURED_BUCKETS.add((bucket, public_read))


async def ensure_bucket(bucket: str, *, public_read: bool = True) -> None:
    await asyncio.to_thread(_ensure_bucket_sync, bucket, public_read=public_read)


def _put_object_sync(
    bucket: str, key: str, body: bytes, content_type: str, *, public_read: bool
) -> None:
    s3 = _get_s3()
    extra: dict[str, str] = {}
    if public_read:
        # Allow CDNs / browsers to cache aggressively for public assets.
        extra["CacheControl"] = "public, max-age=3600"
    else:
        # Private objects (receipts) — never cache shared.
        extra["CacheControl"] = "private, max-age=0, no-store"
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType=content_type,
        **extra,
    )


async def upload_bytes(
    bucket: str,
    key: str,
    body: bytes,
    content_type: str,
    *,
    public_read: bool = True,
) -> str:
    """Upload ``body`` to ``bucket``/``key``.

    For ``public_read=True`` (default) returns the canonical public URL;
    for ``public_read=False`` the returned string is **not** anonymously
    fetchable — callers must use :func:`presigned_get_url` to hand out
    short-lived URLs. Returning the public URL form even for private
    objects keeps the call signature stable but it is the **caller's
    responsibility** never to hand it to a browser.
    """
    await ensure_bucket(bucket, public_read=public_read)
    await asyncio.to_thread(
        _put_object_sync, bucket, key, body, content_type, public_read=public_read
    )
    return public_url(bucket, key)


def public_url(bucket: str, key: str) -> str:
    base = settings.s3_public_url_base.rstrip("/")
    return f"{base}/{bucket}/{key}"


def _presign_get_sync(bucket: str, key: str, expires_in: int) -> str:
    return _get_s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )


async def presigned_get_url(bucket: str, key: str, *, expires_in: int = 300) -> str:
    """Return a short-lived signed URL that grants anonymous GET access.

    Default TTL is 5 minutes — long enough for the browser to render the
    image / open the PDF, short enough to make leaks via referrer / proxy
    logs largely useless. Callers must re-mint the URL on every page load.
    """
    return await asyncio.to_thread(_presign_get_sync, bucket, key, expires_in)


def _delete_sync(bucket: str, key: str) -> None:
    _get_s3().delete_object(Bucket=bucket, Key=key)


async def delete_object(bucket: str, key: str) -> None:
    await asyncio.to_thread(_delete_sync, bucket, key)


def parse_s3_url(url: str, *, buckets: list[str]) -> tuple[str, str] | None:
    """Return `(bucket, key)` if the URL belongs to one of our buckets."""
    parsed = urlparse(url)
    path = parsed.path.lstrip("/")
    if not path:
        return None
    for bucket in buckets:
        prefix = f"{bucket}/"
        if path.startswith(prefix):
            return bucket, path[len(prefix):]
    return None


def generate_key(filename: str) -> str:
    ext = ""
    if "." in filename:
        candidate = filename.rsplit(".", 1)[-1].lower()
        ext = "".join(c for c in candidate if c.isalnum())[:10]
    if not ext:
        ext = "bin"
    return f"{uuid.uuid4().hex}.{ext}"
