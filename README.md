# CANDWAX

Wholesale candle storefront + back-office. The stack is split in two:

- **`/` (this dir)** — React 18 + Vite + TypeScript + Tailwind + shadcn/ui
  frontend. Data access goes through a typed axios client in `src/lib/api/`.
- **`/backend`** — FastAPI + SQLAlchemy 2.x + Alembic + MySQL + local file
  storage, JWT auth, argon2 password hashing. See `backend/README.md` for details.

The old Supabase integration has been fully replaced; there is no hosted
dependency left. The app runs directly on a host with MySQL — no Docker.

> Подробный runbook — **[`docs/RUNBOOK.md`](docs/RUNBOOK.md)**: локальный дев,
> prod-деплой (nginx + TLS), бэкапы, troubleshooting.

## Quick start

Prerequisites: **Python 3.12+**, **Node 18+**, a running **MySQL 8**.

1. Create the database and user (once):

   ```sql
   CREATE DATABASE candles CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'candles'@'localhost' IDENTIFIED BY 'candles';
   GRANT ALL PRIVILEGES ON candles.* TO 'candles'@'localhost';
   FLUSH PRIVILEGES;
   ```

2. Backend:

   ```bash
   cp backend/.env.example backend/.env      # fill JWT_SECRET, DB creds, etc.
   cd backend
   python -m venv .venv && source .venv/Scripts/activate   # Windows; use bin/activate on *nix
   pip install -e ".[dev]"
   alembic upgrade head                       # create schema
   python -m scripts.bootstrap_admin          # create admin user
   uvicorn app.main:app --reload              # http://localhost:8000
   ```

3. Frontend (second terminal, from repo root):

   ```bash
   cp .env.example .env                       # frontend points to http://localhost:8000
   npm install
   npm run dev                                # http://localhost:8080
   ```

The bootstrap script prints the generated admin password on stdout (or uses
`BOOTSTRAP_ADMIN_PASSWORD` from `backend/.env`).

## Architecture

### Frontend → Backend

- Auth: `POST /auth/register` / `POST /auth/login` set short-lived access and
  rotating refresh JWTs as `HttpOnly` cookies; JWT values are never exposed to
  browser JavaScript. On a 401 the axios interceptor silently refreshes once.
- Cookie-auth mutations use a double-submit CSRF cookie/header. Axios sends
  credentials only to the configured API origin, while `BroadcastChannel`
  synchronizes login/logout state across tabs. Bearer auth remains supported
  for non-browser API clients.
- Every page fetches data via react-query + the typed endpoint modules:
  `authApi`, `catalogApi`, `ordersApi`, `stockApi`, `profileApi`, `companyApi`,
  `uploadsApi`.

### Backend highlights

- Single `users` table replaces Supabase `auth.users` + `profiles` + `user_roles`.
- Order numbers (`CW-xxxxx`) are handed out application-side from the
  `order_number_counters` table (see `app.services.orders.repository`).
- Admin uploads go through `POST /admin/uploads/{product-images|company-assets}`;
  files are saved under `backend/storage/` and served as static files at
  `/uploads/...`. Payment receipts are private — served only via a short-lived
  signed `/orders/{id}/receipt-file` URL.
- The external inventory webhook lives at `POST /inventory/webhook` and is
  gated by the `x-webhook-secret` header.

## Common tasks

| Task                          | Command (from `backend/`, venv active)        |
| ----------------------------- | --------------------------------------------- |
| Run backend                   | `uvicorn app.main:app --reload`               |
| Run backend migrations        | `alembic upgrade head`                         |
| Create admin + seed demo data | `python -m scripts.bootstrap_admin`            |
| Backend tests                 | `pytest -q`                                    |
| Full local quality gate       | `npm run check` (running API + Playwright)     |
| Fast local quality gate       | `npm run check:fast` (SQLite, without E2E)     |
| Frontend dev server           | `npm run dev` (from repo root, port 8080)      |
| Frontend type check           | `npm run typecheck`                            |
| Frontend unit tests           | `npm test`                                     |

## Environment variables

### Frontend (`/.env`)

| Var           | Purpose                                                     |
| ------------- | ----------------------------------------------------------- |
| `VITE_API_URL` | Base URL of the FastAPI backend (defaults to localhost:8000). |

### Backend (`/backend/.env`)

See `backend/.env.example` for the full list: database DSN, JWT secret, local
storage paths, webhook secret, CORS origins, and bootstrap admin email/password.

## Production

Коротко: системный MySQL + uvicorn (за systemd / supervisor) + реверс-прокси
(nginx / Caddy) + TLS; статика и загрузки (`backend/storage/`) отдаются nginx
или самим приложением. Пошагово, с nginx-конфигом, обновлениями и откатами — в
**[`docs/RUNBOOK.md` → «Продакшен»](docs/RUNBOOK.md#продакшен)**.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:

- frontend: clean install, ESLint, TypeScript, Vitest, production build;
- backend: Ruff and the complete pytest suite against MySQL 8.4.

The same checks are available locally through `npm run check:fast` or the
full `npm run check`. Do not merge a release while either CI job is red.
