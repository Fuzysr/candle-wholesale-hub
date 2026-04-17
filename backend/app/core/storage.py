"""Thin async wrapper around boto3 for MinIO / S3-compatible storage.

Design choices:

* we use **sync** boto3 under `asyncio.to_thread` instead of aiobotocore to keep
  the dependency footprint small and because uploads are not a hot path
* buckets are created + made world-readable lazily on first use
* public URLs are constructed as `{S3_PUBLIC_URL_BASE}/{bucket}/{key}` which
  matches MinIO's default path-style routing and also works behind a CDN
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


_ENSURED_BUCKETS: set[str] = set()


def _ensure_bucket_sync(bucket: str) -> None:
    if bucket in _ENSURED_BUCKETS:
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
    _ENSURED_BUCKETS.add(bucket)


async def ensure_bucket(bucket: str) -> None:
    await asyncio.to_thread(_ensure_bucket_sync, bucket)


def _put_object_sync(bucket: str, key: str, body: bytes, content_type: str) -> None:
    s3 = _get_s3()
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType=content_type,
        CacheControl="public, max-age=3600",
    )


async def upload_bytes(bucket: str, key: str, body: bytes, content_type: str) -> str:
    """Upload `body` and return the public URL."""
    await ensure_bucket(bucket)
    await asyncio.to_thread(_put_object_sync, bucket, key, body, content_type)
    return public_url(bucket, key)


def public_url(bucket: str, key: str) -> str:
    base = settings.s3_public_url_base.rstrip("/")
    return f"{base}/{bucket}/{key}"


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
