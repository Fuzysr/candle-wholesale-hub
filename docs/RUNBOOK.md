# CANDWAX — Runbook

Подробная инструкция по запуску проекта в **локальной разработке** и в
**продакшене**. Если ты только клонировал репозиторий — иди по разделу
[«Быстрый старт»](#быстрый-старт-для-нетерпеливых). Если нужен prod-деплой —
сразу в [«Продакшен»](#продакшен).

---

## Оглавление

- [Архитектура](#архитектура)
- [Требования](#требования)
- [Быстрый старт (для нетерпеливых)](#быстрый-старт-для-нетерпеливых)
- [Локальная разработка в Docker](#локальная-разработка-в-docker)
- [Локальная разработка без Docker](#локальная-разработка-без-docker)
- [Первый админ и демо-данные](#первый-админ-и-демо-данные)
- [Тесты и линтеры](#тесты-и-линтеры)
- [Типичные задачи разработки](#типичные-задачи-разработки)
- [Продакшен](#продакшен)
- [Бэкапы и восстановление](#бэкапы-и-восстановление)
- [Troubleshooting](#troubleshooting)

---

## Архитектура

```
           ┌──────────────┐        ┌──────────────┐
           │   Frontend   │        │   FastAPI    │
  Browser ─► Vite / React ├───►────►  /auth /cat. ├───┬──► PostgreSQL 16
           │  (статика)   │  REST  │  /orders ... │   │
           └──────────────┘        └──────┬───────┘   │
                                          │           └──► MinIO (S3)
                                          │
                                    JWT (access + refresh) в localStorage
```

- **Frontend** — SPA, собирается в статические файлы (`dist/`). Раздаётся
  любым веб-сервером (nginx, Caddy, CDN).
- **Backend** — FastAPI. Единственная stateful зависимость —
  PostgreSQL 16. Файлы (изображения товаров, ассеты компании) живут в
  MinIO (S3-совместимо).
- **Сессии** — JWT-пара access/refresh в `localStorage` фронта. Сервер
  stateless; перезапуск контейнера не выкидывает пользователей из
  сессий.

Ключевые директории:

| Путь | Что там |
|---|---|
| `src/` | Исходники фронта (Vite + React + TypeScript) |
| `backend/app/` | FastAPI (роутеры в `api/routers`, модели в `models/`) |
| `backend/alembic/` | Миграции БД |
| `backend/scripts/bootstrap_admin.py` | Скрипт заведения админа + демо-каталога |
| `docker-compose.yml` | Dev-режим: код смонтирован, uvicorn `--reload` |
| `docker-compose.prod.yml` | Prod-режим: только образ, `restart: unless-stopped` |

---

## Требования

### Обязательно

- **Docker Desktop ≥ 4.30** (Windows/macOS) или Docker Engine ≥ 24 + compose-plugin (Linux).
- **Node.js 20 LTS** + npm 10 — для фронта. (`node --version` → v20.x).
- **Git**.

### Опционально (для dev без Docker)

- **Python 3.12** + pip.
- **PostgreSQL 16** — локальный или managed.
- **MinIO** — одиночный бинарник с [min.io/download](https://min.io/download).

### Первый запуск Docker Desktop на Windows

Если получаешь `dockerDesktopLinuxEngine: The system cannot find the file
specified`, значит демон ещё не стартовал. Открой Docker Desktop из меню
«Пуск» и дождись зелёной иконки в трее. Чтобы он поднимался сам:
**Settings → General → Start Docker Desktop when you sign in**.

---

## Быстрый старт (для нетерпеливых)

```powershell
# 1. Секреты бэкенда
Copy-Item backend\.env.example backend\.env
# Открой backend\.env и поменяй минимум JWT_SECRET + INVENTORY_WEBHOOK_SECRET.

# 2. URL API для фронта
Copy-Item .env.example .env

# 3. Поднимаем инфраструктуру + бэкенд
docker compose up --build -d

# 4. Создаём админа и демо-каталог
docker compose exec backend python -m scripts.bootstrap_admin

# 5. Ставим и запускаем фронт
npm install
npm run dev
```

Открывай:

- Фронт: http://localhost:5173
- API + Swagger: http://localhost:8000/docs
- MinIO UI: http://localhost:9001 (`minioadmin` / `minioadmin`)

Учётка админа распечатается в выводе шага 4.

---

## Локальная разработка в Docker

### 1. Переменные окружения

Есть **два** `.env`-файла:

| Файл | Кого настраивает |
|---|---|
| `backend/.env` | Сам FastAPI (DATABASE_URL, JWT_SECRET, S3_*, CORS_ORIGINS, секрет вебхука) |
| `.env` (в корне) | Frontend (`VITE_API_URL`) |

Шаблоны: `backend/.env.example` и `.env.example`. Если `backend/.env` не
существует, `docker compose up` упадёт с `env file ... not found`.

Сгенерируй сильные секреты для `backend/.env`:

```powershell
# JWT (64 hex)
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

# Webhook (32 hex)
-join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

или в bash:

```bash
openssl rand -hex 32  # JWT_SECRET
openssl rand -hex 16  # INVENTORY_WEBHOOK_SECRET
```

### 2. Поднять бэкенд + инфру

```bash
docker compose up --build             # в foreground, Ctrl+C останавливает
# или
docker compose up --build -d          # в detached
docker compose logs -f backend        # смотреть логи
```

Что происходит:

1. Поднимается `postgres:16-alpine` (volume `postgres-data`).
2. Поднимается `minio:latest` (volume `minio-data`).
3. Собирается образ `candle-wholesale-hub-backend` из `backend/Dockerfile`.
4. Контейнер `backend` ждёт healthcheck-и Postgres и MinIO, потом
   выполняет `alembic upgrade head` и запускает uvicorn с `--reload`
   (код смонтирован как `./backend:/app`, правки подхватятся).

Сервисы:

| Сервис | Порт хоста | Для чего |
|---|---|---|
| backend | `8000` | FastAPI + `/docs` |
| postgres | `5432` | `candles/candles/candles` |
| minio | `9000` (S3) / `9001` (UI) | `minioadmin/minioadmin` |

### 3. Запустить фронт

Фронт внутри Docker не крутится (Vite dev-server с HMR плохо совместим
с монтированиями Windows). Запускай локально:

```bash
npm install            # только при первом запуске или после смены package.json
npm run dev            # http://localhost:5173
```

Фронт ходит на `VITE_API_URL` из `.env` (по умолчанию
`http://localhost:8000`). CORS разрешён для `http://localhost:5173` и
`http://localhost:8080` — если меняешь порт, добавь его в
`CORS_ORIGINS` в `backend/.env` и перезапусти backend.

### 4. Остановить

```bash
docker compose down              # остановить контейнеры, данные сохранить
docker compose down -v           # ПЛЮС удалить volumes (postgres, minio)
```

---

## Локальная разработка без Docker

Полезно, если надо пошагово отладить миграцию или хочешь подключить PyCharm /
VS Code к живому процессу.

### 1. PostgreSQL 16

Установи и создай БД:

```sql
CREATE ROLE candles WITH LOGIN PASSWORD 'candles';
CREATE DATABASE candles OWNER candles;
```

### 2. MinIO

Скачай одиночный бинарник. Пример запуска:

```bash
minio.exe server C:\minio-data --console-address ":9001"
```

### 3. Python

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

### 4. Переменные

Скопируй `backend/.env.example` → `backend/.env` и подправь:

```env
DATABASE_URL=postgresql+asyncpg://candles:candles@localhost:5432/candles
DATABASE_URL_SYNC=postgresql+psycopg://candles:candles@localhost:5432/candles
S3_ENDPOINT_URL=http://localhost:9000
S3_PUBLIC_URL_BASE=http://localhost:9000
```

### 5. Миграции и запуск

```powershell
alembic upgrade head
uvicorn app.main:app --reload
```

Бэкенд на http://localhost:8000. Фронт — как обычно: `npm run dev` в корне.

---

## Первый админ и демо-данные

Скрипт идемпотентен: повторный запуск не дублирует каталог, но обновляет
пароль админа и гарантирует `role=admin`.

```bash
# В Docker:
docker compose exec backend python -m scripts.bootstrap_admin

# Без Docker:
cd backend
python -m scripts.bootstrap_admin
```

Логика:

- Читает `BOOTSTRAP_ADMIN_EMAIL` и `BOOTSTRAP_ADMIN_PASSWORD` из `.env`.
- Если пароль пустой — генерирует случайный 16-hex и печатает в stdout.
- Создаёт/обновляет пользователя, заливает демо-категории, товары,
  вариации и дисконт-тиры.

Сохрани распечатанный пароль — иначе перезапусти скрипт с заданным
`BOOTSTRAP_ADMIN_PASSWORD`.

---

## Тесты и линтеры

### Backend

```bash
docker compose exec backend pytest -q            # все тесты
docker compose exec backend pytest tests/test_auth.py -q
docker compose exec backend ruff check app tests
docker compose exec backend ruff format --check app tests
```

Или без Docker, из `backend/` с активированным venv:

```bash
pytest -q
ruff check app tests
```

Тесты используют in-memory переключение схемы (см. `tests/conftest.py`)
и не трогают рабочую БД.

### Frontend

```bash
npm test           # vitest, один прогон
npm run test:watch # в режиме watch
npx tsc --noEmit   # типы
npm run lint       # eslint
npm run build      # прод-сборка в dist/
```

---

## Типичные задачи разработки

### Новая миграция

После правки моделей SQLAlchemy:

```bash
docker compose exec backend alembic revision --autogenerate -m "add banner to products"
docker compose exec backend alembic upgrade head
```

Сгенерированный файл ляжет в `backend/alembic/versions/`. Просмотри его
глазами — autogenerate не всегда угадывает DROP.

Откат на одну миграцию вниз:

```bash
docker compose exec backend alembic downgrade -1
```

### Сброс базы

```bash
docker compose down -v          # снесёт и postgres, и minio
docker compose up --build -d
docker compose exec backend python -m scripts.bootstrap_admin
```

### Просмотр OpenAPI

Swagger: http://localhost:8000/docs
ReDoc: http://localhost:8000/redoc
Raw JSON: http://localhost:8000/openapi.json

### Подключение к Postgres

```bash
docker compose exec postgres psql -U candles candles
```

### Файлы в MinIO

UI: http://localhost:9001. Бакеты `product-images` и `company-assets`
создаются бэкендом автоматически при первой загрузке и становятся
publicly readable.

---

## Продакшен

### Модель развёртывания

Рекомендуемая топология для одного VPS:

```
                        ┌─────────────────────────────┐
           HTTPS  :443  │   nginx / Caddy reverse     │
  Clients ────────────► │   proxy (TLS termination)   │
                        └──────┬──────────────┬───────┘
                               │ /api/        │ /
                               ▼              ▼
                        ┌──────────┐   ┌──────────────┐
                        │ backend  │   │  frontend    │
                        │ :8000    │   │  static dist/│
                        └──────────┘   └──────────────┘
                               │
              ┌────────────────┼──────────────────┐
              ▼                ▼                  ▼
        postgres:5432    minio:9000          (volumes)
```

Backend слушает только 127.0.0.1:8000 (см. `docker-compose.prod.yml`);
реверс-прокси на хосте проксирует `/api/*` на него и раздаёт фронтовую
статику напрямую.

### 1. Подготовь сервер

- Ubuntu 22.04+ / любая Linux-VM с 2 vCPU, 4 GB RAM, 40 GB SSD.
- Установи Docker Engine + compose-plugin.
- Открой в файрволе только 80/443.

### 2. Клонируй и настрой окружение

```bash
git clone <repo> /opt/candles && cd /opt/candles
cp backend/.env.example backend/.env
```

Правки для prod `backend/.env`:

| Переменная | Prod-значение |
|---|---|
| `APP_ENV` | `production` |
| `JWT_SECRET` | `openssl rand -hex 32` (строго уникально, не из примера) |
| `INVENTORY_WEBHOOK_SECRET` | `openssl rand -hex 16` |
| `DATABASE_URL` / `DATABASE_URL_SYNC` | свои креды + сильный пароль |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | не `minioadmin` |
| `S3_PUBLIC_URL_BASE` | публичный URL до MinIO (например, `https://files.example.com`) |
| `CORS_ORIGINS` | `https://shop.example.com` (без dev-хостов) |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | реальные, один раз |

Аналогично для MinIO и Postgres в `docker-compose.prod.yml` через переменные
окружения на уровне compose (`POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`)
или проставь значения прямо в файле.

### 3. Сборка фронта

Собирать фронт лучше на CI или на своей машине:

```bash
npm ci
VITE_API_URL=https://shop.example.com npm run build
```

В `dist/` — готовая статика. Залей её в nginx root (например,
`/var/www/candles/`) или в CDN (S3 + CloudFront).

**Важно:** `VITE_API_URL` **запекается в бандл на этапе `npm run build`**. Если
меняешь домен API — пересобирай фронт.

### 4. Запусти инфраструктуру + бэкенд

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head
docker compose -f docker-compose.prod.yml run --rm backend python -m scripts.bootstrap_admin
docker compose -f docker-compose.prod.yml up -d
```

Проверь здоровье:

```bash
curl -fsS http://127.0.0.1:8000/health    # {"status":"ok","env":"production"}
docker compose -f docker-compose.prod.yml ps
```

### 5. Reverse proxy + TLS

Пример nginx (`/etc/nginx/sites-available/candles`):

```nginx
server {
    listen 80;
    server_name shop.example.com files.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name shop.example.com;

    ssl_certificate     /etc/letsencrypt/live/shop.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shop.example.com/privkey.pem;

    client_max_body_size 20M;    # под загрузку изображений

    # SPA
    root /var/www/candles;
    index index.html;
    location / {
        try_files $uri /index.html;
    }

    # API
    location /api/ {
        proxy_pass         http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name files.example.com;

    ssl_certificate     /etc/letsencrypt/live/files.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/files.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:9000;
        proxy_set_header   Host $host;
    }
}
```

Замечания:

- Если выставляешь API не на корне (`/api/*`), то собирай фронт с
  `VITE_API_URL=https://shop.example.com/api` и в `backend/.env`
  положи `CORS_ORIGINS=https://shop.example.com`. В этом случае
  `proxy_pass http://127.0.0.1:8000/;` перепишет `/api/foo` → `/foo`.
- Выдать TLS-сертификаты: `sudo certbot --nginx -d shop.example.com -d files.example.com`.

### 6. Обновление прод-версии

```bash
cd /opt/candles
git fetch --all && git checkout <tag-or-commit>

# backend
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head
docker compose -f docker-compose.prod.yml up -d backend

# frontend
npm ci && VITE_API_URL=https://shop.example.com npm run build
rsync -av --delete dist/ /var/www/candles/
```

Downtime только на момент рестарта backend (1–2 сек).

### Откат

```bash
git checkout <previous-tag>
docker compose -f docker-compose.prod.yml build backend
# ВНИМАНИЕ: откатить миграцию вручную, если новая версия её добавила
docker compose -f docker-compose.prod.yml run --rm backend alembic downgrade -1
docker compose -f docker-compose.prod.yml up -d backend
# frontend — аналогично, пересобрать и rsync
```

---

## Бэкапы и восстановление

### PostgreSQL

Раз в сутки снимать dump:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_dump -U candles -d candles -Fc \
    > /backups/candles-$(date +%F).dump
```

Восстановление:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_restore -U candles -d candles --clean --if-exists \
    < /backups/candles-2026-04-17.dump
```

### MinIO

Используй `mc` (MinIO client) для синхронизации на внешнее S3 /
вторую MinIO / локальную директорию:

```bash
mc alias set local http://127.0.0.1:9000 minioadmin minioadmin
mc mirror --remove local/product-images /backups/minio/product-images/
mc mirror --remove local/company-assets /backups/minio/company-assets/
```

Рекомендую поднять вторую MinIO на отдельном сервере и настроить
`mc mirror --watch` — тогда потеря одного диска не потеряет картинки.

### Весь сервер целиком

Том Docker — это обычная директория на хосте (`/var/lib/docker/volumes/`).
Бэкапь её же — например, `restic` / `borg` на S3 (`restic backup /var/lib/docker/volumes`).

---

## Troubleshooting

### `env file ... backend\.env not found`

Не скопирован `backend/.env.example` → `backend/.env`. См.
[«Локальная разработка в Docker → Переменные окружения»](#1-переменные-окружения).

### `dockerDesktopLinuxEngine: The system cannot find the file specified`

Docker Desktop не запущен. Открой его из меню «Пуск» и подожди
зелёной иконки в трее.

### `address already in use: 5432 / 8000 / 9000`

На хосте уже что-то слушает этот порт. Варианты:

- Остановить локальный Postgres / другой процесс.
- В `docker-compose.yml` поменять левую часть проброса: `- "15432:5432"`.

### Фронт логинится, но сразу выкидывает в `/auth`

Типовая причина — CORS или неправильный `VITE_API_URL`.
Проверь:

1. DevTools → Network → должен быть ответ `200` от `/auth/me`. Если `CORS error`,
   добавь origin фронта в `CORS_ORIGINS` в `backend/.env` и рестартуй backend.
2. `VITE_API_URL` в `.env` = на какой URL реально отвечает бэкенд.
3. Часы на сервере и на клиенте не разъехались > TTL access-токена (30 мин).

### Изображения не отображаются (404 на `/product-images/...`)

`S3_PUBLIC_URL_BASE` не совпадает с тем, как MinIO реально доступен
извне. В dev должно быть `http://localhost:9000`; в prod — домен вроде
`https://files.example.com`. После правки в `.env` рестартуй backend;
старые URL в БД при этом остаются старыми — перезалей картинки либо
пропатчи базу `UPDATE product_images SET url = REPLACE(url, 'old', 'new');`.

### 401 Unauthorized сразу после логина

Сверь `JWT_SECRET` между бэкендом и его перезапуском — если после
рестарта контейнера секрет изменился, все старые токены инвалидны. В prod
ставь его один раз и не ротируй без нужды.

### `alembic` ругается на `relation already exists`

Миграции применились частично. Проверь состояние:

```bash
docker compose exec backend alembic current
```

Если `(head)` уже отмечен — всё ок, просто уже накатано. Если нет —
нужно либо вручную применить нужные DDL, либо откатить
(`alembic downgrade ...`) и накатить заново.

### `docker compose up` долго висит на `Waiting for postgres`

Postgres не прошёл healthcheck. Посмотри логи:

```bash
docker compose logs postgres
```

Чаще всего — остаточные данные от старой версии Postgres. Сбрось volume:
`docker compose down -v`.

---

## Полезные ссылки

- FastAPI docs: http://localhost:8000/docs
- MinIO UI: http://localhost:9001
- `backend/README.md` — короткая шпаргалка по самому бэкенду
- `README.md` — обзор проекта
