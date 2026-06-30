"""Regression coverage for browser-visible unexpected API errors."""

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from httpx import ASGITransport, AsyncClient

from app.core.middleware import UnhandledExceptionMiddleware


@pytest.mark.asyncio
async def test_unhandled_error_keeps_cors_headers_and_json_body() -> None:
    app = FastAPI()

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("database unavailable")

    # This is the same intentional ordering used by create_app(): CORS is
    # outermost and sees the normalized response produced by the error layer.
    app.add_middleware(UnhandledExceptionMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:8080"],
        allow_credentials=True,
        allow_methods=["GET"],
        allow_headers=["Content-Type"],
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get(
            "/boom",
            headers={"Origin": "http://localhost:8080"},
        )

    assert response.status_code == 500
    assert response.json() == {"detail": "internal server error"}
    assert response.headers["access-control-allow-origin"] == "http://localhost:8080"

