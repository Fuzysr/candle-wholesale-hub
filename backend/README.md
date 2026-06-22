# CANDWAX — Backend (FastAPI)

FastAPI + MySQL + JWT backend that replaced the earlier Supabase layer.

> Инструкции по запуску (локальный дев, prod-деплой, бэкапы,
> troubleshooting) — в корневом **[`docs/RUNBOOK.md`](../docs/RUNBOOK.md)**.
> Этот файл — технический обзор именно бэкенда.

## Stack

- **Python 3.12**, **FastAPI**, **Pydantic v2**
- **SQLAlchemy 2.x (async)** + **aiomysql** (sync **PyMySQL** for Alembic)
- **Alembic** for migrations
- **argon2-cffi** for password hashing
- **PyJWT** for access / refresh / reset tokens
- **Local filesystem** for file storage (public uploads via StaticFiles,
  private receipts via signed URLs)
- **pytest + httpx** for API tests

## Layout

```
backend/
  app/
    main.py            # FastAPI app, CORS, /health, StaticFiles, router wiring
    core/              # config, db engine, security, local storage helpers
    services/orders/   # pricing, inventory, receipts, notifications, repository
    models/            # SQLAlchemy models (one per domain)
    schemas/           # Pydantic schemas (request/response)
    api/
      deps.py          # get_db, get_current_user, require_admin
      routers/         # HTTP endpoints grouped by domain
  alembic/             # migrations (0001_mysql_baseline = full MySQL schema)
  scripts/
    bootstrap_admin.py # idempotent: admin user + demo catalog
  storage/             # uploaded files (gitignored) — back this up in prod
  tests/               # pytest + httpx (auth, access, catalog, orders)
  pyproject.toml
```

## Minimum commands

```bash
# Из backend/ с активированным venv (требуется запущенный MySQL):
pip install -e ".[dev]"
alembic upgrade head
python -m scripts.bootstrap_admin
uvicorn app.main:app --reload
pytest -q
ruff check app tests
```

## HTTP surface

### Auth (`/auth`)

- `POST /auth/register` — `{ email, password, company_name, contact_name, phone }`
- `POST /auth/login` — `{ email, password }` → user + HttpOnly auth cookies
- `POST /auth/refresh` — `{}` → rotates HttpOnly access/refresh cookies
- `POST /auth/logout` — revokes refresh and expires auth cookies
- `POST /auth/password/reset-request` — `{ email }`
- `POST /auth/password/reset-confirm` — `{ token, password }`
- `GET  /auth/me` — current user + role + profile

### Profile (`/profile`) — authenticated

- `GET /profile`
- `PATCH /profile` — `company_name, contact_name, phone, inn, address`

### Catalog (public reads)

- `GET /categories`
- `GET /attributes/{materials|scents|shapes}`
- `GET /products` — backwards-compatible offset list
- `GET /products/search` — filtered page envelope (`items`, `total`, `pages`);
  supports categories, attributes, colors, price/dimensions, stock, search and sorting
- `GET /products/colors` — stable color facet values for catalog filters
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
| `DATABASE_URL` / `DATABASE_URL_SYNC` | async (app) / sync (alembic) MySQL URLs |
| `JWT_SECRET` | HS256 signing key — **must be a strong random value in prod** |
| `ACCESS_TOKEN_TTL_MIN` / `REFRESH_TOKEN_TTL_DAYS` | JWT lifetimes |
| `AUTH_COOKIE_SAMESITE` / `AUTH_COOKIE_DOMAIN` | browser cookie policy/domain |
| `CORS_ORIGINS` | exact comma-separated frontend origins; wildcard is unsupported with cookies |
| `LOCAL_STORAGE_ROOT` | dir on disk where uploaded files are saved |
| `PUBLIC_UPLOAD_URL_BASE` | absolute URL prefix for public uploads (served via StaticFiles) |
| `BACKEND_BASE_URL` / `RECEIPT_URL_TTL_SEC` | base + TTL for signed private-receipt URLs |
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
# from backend/ with the venv active:
pytest -q
pytest tests/test_orders.py::test_create_order -q
ruff check app tests
```

`tests/conftest.py` creates an isolated schema per run — tests never
touch the dev database.

## Database migrations

```bash
# from backend/ with the venv active:
alembic current              # show applied head
alembic upgrade head         # apply new
alembic downgrade -1         # revert last
alembic revision --autogenerate -m "msg"
```

Always review autogenerated migrations before committing — autogenerate
detects column renames as DROP+ADD.
