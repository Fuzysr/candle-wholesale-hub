# CANDWAX — Backend (FastAPI)

FastAPI + PostgreSQL + JWT backend that replaced the earlier Supabase layer.

> Инструкции по запуску (Docker / без Docker, prod-деплой, бэкапы,
> troubleshooting) — в корневом **[`docs/RUNBOOK.md`](../docs/RUNBOOK.md)**.
> Этот файл — технический обзор именно бэкенда.

## Stack

- **Python 3.12**, **FastAPI**, **Pydantic v2**
- **SQLAlchemy 2.x (async)** + **asyncpg**
- **Alembic** for migrations
- **argon2-cffi** for password hashing
- **PyJWT** for access / refresh / reset tokens
- **MinIO** (S3-compatible) for file storage via `boto3`
- **pytest + httpx** for API tests

## Layout

```
backend/
  app/
    main.py            # FastAPI app, CORS, /health, router wiring
    core/              # config, db engine, security, S3 storage helpers
    models/            # SQLAlchemy models (one per domain)
    schemas/           # Pydantic schemas (request/response)
    api/
      deps.py          # get_db, get_current_user, require_admin
      routers/         # HTTP endpoints grouped by domain
  alembic/             # migrations (0001_initial_schema = full port from Supabase)
  scripts/
    bootstrap_admin.py # idempotent: admin user + demo catalog
  tests/               # pytest + httpx (auth, access, catalog, orders)
  pyproject.toml
  Dockerfile
```

## Minimum commands

```bash
# Из корня репозитория, когда `docker compose up` уже поднят:
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.bootstrap_admin
docker compose exec backend pytest -q

# Без Docker, из backend/ с активированным venv:
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
pytest -q
ruff check app tests
```

## HTTP surface

### Auth (`/auth`)

- `POST /auth/register` — `{ email, password, company_name, contact_name, phone }`
- `POST /auth/login` — `{ email, password }` → `{ access, refresh }`
- `POST /auth/refresh` — `{ refresh }` → new access token
- `POST /auth/logout` — client drops tokens (server stateless)
- `POST /auth/password/reset-request` — `{ email }`
- `POST /auth/password/reset-confirm` — `{ token, password }`
- `GET  /auth/me` — current user + role + profile

### Profile (`/profile`) — authenticated

- `GET /profile`
- `PATCH /profile` — `company_name, contact_name, phone, inn, address`

### Catalog (public reads)

- `GET /categories`
- `GET /attributes/{materials|scents|shapes}`
- `GET /products?published=true&category=&material=&scent=&shape=&q=`
- `GET /products/{slug}` — includes variants, images, material, scent, shape, category
- `GET /discount-tiers`

### Catalog admin (`/admin/...`) — `require_admin`

- Categories: `POST /admin/categories` · `PATCH /admin/categories/{id}` · `DELETE /admin/categories/{id}`
- Products: `POST /admin/products` · `PATCH /admin/products/{id}` · `DELETE /admin/products/{id}`
- Variants: `POST /admin/products/{id}/variants` · `PATCH /admin/variants/{id}` · `DELETE /admin/variants/{id}`
- Images: `POST /admin/products/{id}/images` · `PATCH /admin/images/{id}` · `DELETE /admin/images/{id}`
- Attributes: `POST|PATCH|DELETE /admin/attributes/{kind}[...]` where `kind ∈ {materials, scents, shapes}`
- Discount tiers: `POST|PATCH|DELETE /admin/discount-tiers[...]`

### Orders

- `POST  /orders` — create order + items (authenticated)
- `GET   /orders` — my orders
- `GET   /orders/{id}` — own order, admins see any
- `PATCH /admin/orders/{id}` — update status (writes `order_status_history`)
- `GET   /admin/orders` — all orders with filters

### Stock / Inventory

- `GET  /admin/stock` — variants with stock/reserved/available
- `POST /admin/stock/movements` — `{ variant_id, type, qty_boxes, comment }`
- `POST /inventory/webhook` — external push, header `x-webhook-secret`
- `GET  /inventory/sync` — admin snapshot for outbound integrations

### Company settings

- `GET   /company-settings` — public read (invoice footer, offer text)
- `PATCH /admin/company-settings` — admin update

### Uploads

- `POST   /admin/uploads/product-images` — multipart, returns `{ url }`
- `POST   /admin/uploads/company-assets` — multipart, returns `{ url }`
- `DELETE /admin/uploads` — `{ url }`, removes object by URL prefix

Full, machine-readable spec is served at runtime:

- Swagger UI — http://localhost:8000/docs
- ReDoc — http://localhost:8000/redoc
- OpenAPI JSON — http://localhost:8000/openapi.json

## Environment variables

See `.env.example`. Highlights:

| Var | Purpose |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_SYNC` | async (app) / sync (alembic) Postgres URLs |
| `JWT_SECRET` | HS256 signing key — **must be a strong random value in prod** |
| `ACCESS_TOKEN_TTL_MIN` / `REFRESH_TOKEN_TTL_DAYS` | JWT lifetimes |
| `CORS_ORIGINS` | comma-separated frontend origins |
| `S3_ENDPOINT_URL` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | MinIO / S3 creds |
| `S3_BUCKET_PRODUCTS` / `S3_BUCKET_COMPANY` | target buckets (auto-created) |
| `S3_PUBLIC_URL_BASE` | public URL prefix embedded in stored image URLs |
| `INVENTORY_WEBHOOK_SECRET` | shared secret for external warehouse push |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | consumed by `bootstrap_admin.py` |

Secrets generation (PowerShell):

```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })   # JWT_SECRET
-join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })   # INVENTORY_WEBHOOK_SECRET
```

or (bash):

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 16   # INVENTORY_WEBHOOK_SECRET
```

## Testing

```bash
docker compose exec backend pytest -q
docker compose exec backend pytest tests/test_orders.py::test_create_order -q
docker compose exec backend ruff check app tests
```

`tests/conftest.py` creates an isolated schema per run — tests never
touch the dev database.

## Database migrations

```bash
docker compose exec backend alembic current              # show applied head
docker compose exec backend alembic upgrade head         # apply new
docker compose exec backend alembic downgrade -1         # revert last
docker compose exec backend alembic revision --autogenerate -m "msg"
```

Always review autogenerated migrations before committing — autogenerate
detects column renames as DROP+ADD.
