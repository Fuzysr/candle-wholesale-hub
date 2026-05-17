# CANDWAX

Wholesale candle storefront + back-office. The stack is split in two:

- **`/` (this dir)** — React 18 + Vite + TypeScript + Tailwind + shadcn/ui
  frontend. Data access goes through a typed axios client in `src/lib/api/`.
- **`/backend`** — FastAPI + SQLAlchemy 2.x + Alembic + Postgres + MinIO,
  JWT auth, argon2 password hashing. See `backend/README.md` for details.

The old Supabase integration has been fully replaced; there is no hosted
dependency left.

> Подробный runbook — **[`docs/RUNBOOK.md`](docs/RUNBOOK.md)**: дев в Docker и
> без него, prod-деплой (nginx + TLS), бэкапы, troubleshooting.

## Quick start (Docker)

```bash
cp backend/.env.example backend/.env      # fill JWT_SECRET etc.
cp .env.example .env                      # frontend points to http://localhost:8000
docker compose up --build                 # postgres + minio + api on :8000
```

In a second terminal start the frontend:

```bash
npm install
npm run dev                                # http://localhost:5173
```

Seed an admin user + demo catalog:

```bash
docker compose exec backend python -m scripts.bootstrap_admin
```

The bootstrap script prints the generated admin password on stdout (or uses
`BOOTSTRAP_ADMIN_PASSWORD` from `backend/.env`).

## Architecture

### Frontend → Backend

- Auth: `POST /auth/register` / `POST /auth/login` return a JWT access + refresh
  pair. The access token is attached to every request as `Authorization: Bearer
  ...`. On a 401 the axios interceptor in `src/lib/api/client.ts` silently
  retries once after hitting `POST /auth/refresh`.
- Tokens live in `localStorage` (`cwh:access` / `cwh:refresh`). The
  `tokenStore` helper dispatches a `cwh:auth-changed` event so the `useAuth`
  hook can invalidate its react-query cache across tabs.
- Every page fetches data via react-query + the typed endpoint modules:
  `authApi`, `catalogApi`, `ordersApi`, `stockApi`, `profileApi`, `companyApi`,
  `uploadsApi`.

### Backend highlights

- Single `users` table replaces Supabase `auth.users` + `profiles` + `user_roles`.
- `generate_order_number()` trigger keeps the auto-incrementing `WC-xxxxx`
  order numbers.
- Admin uploads go through `POST /admin/uploads/{product-images|company-assets}`;
  MinIO buckets are created + made publicly readable on first use.
- The external inventory webhook lives at `POST /inventory/webhook` and is
  gated by the `x-webhook-secret` header.

## Common tasks

| Task                          | Command                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| Start all services            | `docker compose up --build`                                  |
| Run backend migrations        | `docker compose exec backend alembic upgrade head`           |
| Create admin + seed demo data | `docker compose exec backend python -m scripts.bootstrap_admin` |
| Backend tests                 | `docker compose exec backend pytest -q`                      |
| Frontend dev server           | `npm run dev`                                                |
| Frontend type check           | `npx tsc --noEmit`                                           |
| Frontend unit tests           | `npm test`                                                   |

## Environment variables

### Frontend (`/.env`)

| Var           | Purpose                                                     |
| ------------- | ----------------------------------------------------------- |
| `VITE_API_URL` | Base URL of the FastAPI backend (defaults to localhost:8000). |

### Backend (`/backend/.env`)

See `backend/.env.example` for the full list: database DSN, JWT secret, MinIO
credentials, webhook secret, CORS origins, and bootstrap admin email/password.

## Production

Коротко: `docker-compose.prod.yml` + реверс-прокси (nginx / Caddy) + TLS.
Пошагово, с nginx-конфигом, обновлениями и откатами — в
**[`docs/RUNBOOK.md` → «Продакшен»](docs/RUNBOOK.md#продакшен)**.
