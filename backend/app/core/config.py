from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Placeholder values from `.env.example` and obvious "weak" defaults. We
# refuse to start in `APP_ENV=production` if any of these are still in
# place — running with them is functionally equivalent to having no
# authentication at all. Comparison is case-insensitive, post-strip.
_WEAK_SECRETS: frozenset[str] = frozenset({
    "",
    "change-me",
    "changeme",
    "replace-me",
    "replaceme",
    "secret",
    "password",
    "test",
    "default",
})


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
    s3_bucket_receipts: str = "payment-receipts"
    s3_public_url_base: str = "http://localhost:9000"
    # Максимальный размер одного загружаемого файла (в байтах). По умолчанию
    # 5 МБ — это же ограничение зашито в <ImageUpload>/<MultiImageUpload>
    # на фронте, так что UI и сервер совпадают.
    upload_max_bytes: int = 5 * 1024 * 1024

    # Inventory webhook
    inventory_webhook_secret: str = "replace-me"

    # Rate-limiting (slowapi). True by default so prod gets protection
    # automatically; the test suite explicitly sets this to False via
    # the env var to avoid bursts of `client.post("/auth/login", ...)`
    # in unrelated test cases tripping the limiter.
    rate_limit_enabled: bool = True

    # SMTP (for sending emails to customers)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "CANDWAX"
    smtp_use_tls: bool = True

    # Bootstrap admin
    bootstrap_admin_email: str = "admin@candles.local"
    bootstrap_admin_password: str = ""

    # Публичный URL фронтенда — используется при сборке ссылок в
    # письмах (например, ссылка на страницу сброса пароля). По
    # умолчанию совпадает с локальным dev-сервером Vite; на проде
    # подставляется домен витрины через переменную окружения.
    web_app_url: str = "http://localhost:8080"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _enforce_production_hygiene(self) -> "Settings":
        """Refuse to boot in `APP_ENV=production` with placeholder secrets
        or a wildcard CORS list.

        Failing fast at startup is much better than discovering after the
        fact that a prod deploy is running with `JWT_SECRET=change-me` —
        every issued JWT is forgeable in that case, and it is not a
        condition we can monitor for at runtime once it's wrong.
        """
        if self.app_env != "production":
            return self

        problems: list[str] = []

        if self.jwt_secret.strip().lower() in _WEAK_SECRETS:
            problems.append("JWT_SECRET is a placeholder/weak value")
        if len(self.jwt_secret) < 32:
            # 32 bytes ≈ 256 bits — the minimum for HS256/HS512 to give
            # the algorithm its full strength.
            problems.append("JWT_SECRET must be at least 32 characters long")

        if self.inventory_webhook_secret.strip().lower() in _WEAK_SECRETS:
            problems.append(
                "INVENTORY_WEBHOOK_SECRET is a placeholder/weak value"
            )

        if any(o.strip() == "*" for o in self.cors_origins):
            problems.append("CORS_ORIGINS must not contain '*' in production")
        if not self.cors_origins:
            problems.append("CORS_ORIGINS must list at least one origin in production")

        # bootstrap_admin_password is only consulted when the bootstrap
        # script runs, but if an operator wired the bootstrap email
        # without a password they're effectively shipping an admin user
        # with an empty password.
        if self.bootstrap_admin_email and not self.bootstrap_admin_password:
            problems.append(
                "BOOTSTRAP_ADMIN_PASSWORD must be set whenever "
                "BOOTSTRAP_ADMIN_EMAIL is set"
            )
        if (
            self.bootstrap_admin_password
            and self.bootstrap_admin_password.strip().lower() in _WEAK_SECRETS
        ):
            problems.append("BOOTSTRAP_ADMIN_PASSWORD is a placeholder/weak value")

        if problems:
            raise ValueError(
                "refusing to start in production with insecure config:\n  - "
                + "\n  - ".join(problems)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
