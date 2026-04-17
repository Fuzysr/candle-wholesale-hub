from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_env: Literal["development", "production", "test"] = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://candles:candles@localhost:5432/candles",
        description="Async SQLAlchemy URL used by the app",
    )
    database_url_sync: str = Field(
        default="postgresql+psycopg://candles:candles@localhost:5432/candles",
        description="Sync SQLAlchemy URL used by Alembic",
    )

    # JWT
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 30
    refresh_token_ttl_days: int = 30
    password_reset_ttl_min: int = 60

    # CORS.
    #
    # NoDecode disables pydantic-settings' automatic JSON decoding for env
    # values of complex types. Without it, `CORS_ORIGINS=http://a,http://b`
    # in .env would be fed through `json.loads(...)` before hitting the
    # validator below and blow up with "Expecting value: line 1 column 1".
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:8080"]
    )

    # Storage (MinIO / S3)
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"
    s3_bucket_products: str = "product-images"
    s3_bucket_company: str = "company-assets"
    s3_public_url_base: str = "http://localhost:9000"

    # Inventory webhook
    inventory_webhook_secret: str = "replace-me"

    # Bootstrap admin
    bootstrap_admin_email: str = "admin@candles.local"
    bootstrap_admin_password: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
