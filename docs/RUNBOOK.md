# CANDWAX — Runbook

Подробная инструкция по запуску проекта в **локальной разработке** и в
**продакшене**. Проект работает **без Docker**: системный MySQL + Python-venv
для бэкенда + Node для фронта. Если ты только клонировал репозиторий — иди по
разделу [«Быстрый старт»](#быстрый-старт). Если нужен prod-деплой — сразу в
[«Продакшен»](#продакшен).

---

## Оглавление

- [Архитектура](#архитектура)
- [Требования](#требования)
- [Быстрый старт](#быстрый-старт)
- [Локальная разработка](#локальная-разработка)
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
  Browser ─► Vite / React ├───►────►  /auth /cat. ├───┬──► MySQL 8
           │  (статика)   │  REST  │  /orders ... │   │
           └──────────────┘        └──────┬───────┘   │
                                          │           └──► local FS (storage/)
                                          │
                                    JWT (access + refresh) в localStorage
```

- **Frontend** — SPA, собирается в статические файлы (`dist/`). Раздаётся
  любым веб-сервером (nginx, Caddy, CDN).
- **Backend** — FastAPI. Единственная stateful зависимость — **MySQL 8**.
  Файлы (изображения товаров, ассеты компании, чеки оплаты) хранятся на
  **локальном диске** под `backend/storage/`. Публичные файлы отдаются через
  FastAPI StaticFiles (`/uploads/...`), приватные чеки — только по
  короткоживущей подписанной ссылке `/orders/{id}/receipt-file`.
- **Сессии** — JWT-пара access/refresh в `localStorage` фронта. Сервер
  stateless; перезапуск процесса не выкидывает пользователей из сессий.

Ключевые директории:

| Путь | Что там |
|---|---|
| `src/` | Исходники фронта (Vite + React + TypeScript) |
| `backend/app/` | FastAPI (роутеры в `api/routers`, модели в `models/`) |
| `backend/alembic/` | Миграции БД (`0001_mysql_baseline` — полная схема MySQL) |
| `backend/scripts/bootstrap_admin.py` | Скрипт заведения админа + демо-каталога |
| `backend/storage/` | Загруженные файлы (gitignored, бэкапить в prod) |

---

## Требования

- **Python 3.12+** + pip.
- **MySQL 8** — локальный или managed.
- **Node.js 20 LTS** + npm 10 — для фронта (`node --version` → v20.x).
- **Git**.

---

## Быстрый старт

```powershell
# 1. Создай БД и пользователя в MySQL (один раз) — см. SQL ниже.

# 2. Секреты бэкенда
Copy-Item backend\.env.example backend\.env
# Открой backend\.env и поменяй минимум JWT_SECRET + INVENTORY_WEBHOOK_SECRET,
# а также DATABASE_URL / DATABASE_URL_SYNC под свои MySQL-креды.

# 3. URL API для фронта
Copy-Item .env.example .env

# 4. Бэкенд
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
alembic upgrade head
python -m scripts.bootstrap_admin
uvicorn app.main:app --reload

# 5. Фронт (во втором терминале, из корня репозитория)
npm install
npm run dev
```

SQL для шага 1:

```sql
CREATE DATABASE candles CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'candles'@'localhost' IDENTIFIED BY 'candles';
GRANT ALL PRIVILEGES ON candles.* TO 'candles'@'localhost';
FLUSH PRIVILEGES;
```

Открывай:

- Фронт: http://localhost:5173
- API + Swagger: http://localhost:8000/docs

Учётка админа распечатается в выводе шага 4 (`python -m scripts.bootstrap_admin`).

---

## Локальная разработка

### 1. MySQL 8

Установи MySQL и создай БД + пользователя (SQL выше). Важно: кодировка
`utf8mb4` — в каталоге есть кириллица и эмодзи.

### 2. Переменные окружения

Есть **два** `.env`-файла:

| Файл | Кого настраивает |
|---|---|
| `backend/.env` | Сам FastAPI (DATABASE_URL, JWT_SECRET, storage-пути, CORS_ORIGINS, секрет вебхука) |
| `.env` (в корне) | Frontend (`VITE_API_URL`) |

Шаблоны: `backend/.env.example` и `.env.example`.

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

Ключевые storage-переменные (см. `backend/.env.example`):

```env
DATABASE_URL=mysql+aiomysql://candles:candles@localhost:3306/candles
DATABASE_URL_SYNC=mysql+pymysql://candles:candles@localhost:3306/candles
LOCAL_STORAGE_ROOT=./storage
PUBLIC_UPLOAD_URL_BASE=http://localhost:8000/uploads
BACKEND_BASE_URL=http://localhost:8000
```

### 3. Python-окружение

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1     # на *nix: source .venv/bin/activate
pip install -e ".[dev]"
```

### 4. Миграции и запуск

```powershell
alembic upgrade head
uvicorn app.main:app --reload
```

Бэкенд на http://localhost:8000. Папка `backend/storage/` создаётся
автоматически при старте.

### 5. Фронт

```bash
npm install            # только при первом запуске или после смены package.json
npm run dev            # http://localhost:5173
```

Фронт ходит на `VITE_API_URL` из `.env` (по умолчанию
`http://localhost:8000`). CORS разрешён для `http://localhost:5173` и
`http://localhost:8080` — если меняешь порт, добавь его в `CORS_ORIGINS` в
`backend/.env` и перезапусти backend.

---

## Первый админ и демо-данные

Скрипт идемпотентен: повторный запуск не дублирует каталог, но обновляет
пароль админа и гарантирует `role=admin`.

```bash
cd backend           # с активированным venv
python -m scripts.bootstrap_admin
```

Логика:

- Читает `BOOTSTRAP_ADMIN_EMAIL` и `BOOTSTRAP_ADMIN_PASSWORD` из `.env`.
- Если пароль пустой — генерирует случайный 16-hex и печатает в stdout.
- Создаёт/обновляет пользователя-админа.

Сохрани распечатанный пароль — иначе перезапусти скрипт с заданным
`BOOTSTRAP_ADMIN_PASSWORD`.

Дополнительные демо-данные (товары, картинки галерей):

```bash
python -m scripts.seed_demo_products
python -m scripts.seed_mock_data
```

---

## Тесты и линтеры

### Backend

```bash
# из backend/ с активированным venv:
pytest -q                       # все тесты
pytest tests/test_auth.py -q
ruff check app tests
ruff format --check app tests
```

Тесты создают изолированную схему на прогон (см. `tests/conftest.py`)
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

После правки моделей SQLAlchemy (из `backend/` с активным venv):

```bash
alembic revision --autogenerate -m "add banner to products"
alembic upgrade head
```

Сгенерированный файл ляжет в `backend/alembic/versions/`. Просмотри его
глазами — autogenerate не всегда угадывает DROP. Откат на одну вниз:

```bash
alembic downgrade -1
```

### Сброс базы

```bash
alembic downgrade base      # снести все таблицы
alembic upgrade head        # создать заново
python -m scripts.bootstrap_admin
```

Чтобы заодно почистить загруженные файлы — удали `backend/storage/`.

### Просмотр OpenAPI

Swagger: http://localhost:8000/docs
ReDoc: http://localhost:8000/redoc
Raw JSON: http://localhost:8000/openapi.json

### Подключение к MySQL

```bash
mysql -u candles -p candles
```

### Загруженные файлы

Лежат на диске под `backend/storage/<категория>/`:

- `product-images/`, `company-assets/` — публичные, отдаются по
  `http://localhost:8000/uploads/<категория>/<файл>`.
- `payment-receipts/` — приватные, **не** отдаются статикой; только по
  подписанной ссылке `/orders/{id}/receipt-file?exp=...&sig=...`.

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
                        │ uvicorn  │   │  frontend    │
                        │ :8000    │   │  static dist/│
                        └────┬─────┘   └──────────────┘
                             │
                             ▼
                          MySQL 8
                     (+ backend/storage/)
```

Backend (uvicorn) слушает только 127.0.0.1:8000 под управлением systemd;
реверс-прокси на хосте проксирует `/api/*` на него и раздаёт фронтовую
статику. Публичные загрузки можно отдавать либо через бэкенд (`/uploads/`),
либо напрямую nginx из `backend/storage/product-images` и `.../company-assets`.

### 1. Подготовь сервер

- Ubuntu 22.04+ / любая Linux-VM с 2 vCPU, 4 GB RAM, 40 GB SSD.
- Установи **Python 3.12**, **MySQL 8**, **nginx**, **git**.
- Открой в файрволе только 80/443.

### 2. Клонируй и настрой окружение

```bash
git clone <repo> /opt/candles && cd /opt/candles
cp backend/.env.example backend/.env
```

Создай БД (SQL из «Быстрого старта», но с сильным паролем) и заполни prod
`backend/.env`:

| Переменная | Prod-значение |
|---|---|
| `APP_ENV` | `production` |
| `JWT_SECRET` | `openssl rand -hex 32` (строго уникально, не из примера) |
| `INVENTORY_WEBHOOK_SECRET` | `openssl rand -hex 16` |
| `DATABASE_URL` / `DATABASE_URL_SYNC` | свои креды + сильный пароль |
| `LOCAL_STORAGE_ROOT` | абсолютный путь, например `/opt/candles/backend/storage` |
| `PUBLIC_UPLOAD_URL_BASE` | публичный URL до загрузок, напр. `https://shop.example.com/uploads` |
| `BACKEND_BASE_URL` | публичный origin бэкенда, напр. `https://shop.example.com` |
| `CORS_ORIGINS` | `https://shop.example.com` (без dev-хостов) |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | реальные, один раз |

### 3. Backend (venv + миграции)

```bash
cd /opt/candles/backend
python -m venv .venv
source .venv/bin/activate
pip install -e .            # без [dev] на проде
alembic upgrade head
python -m scripts.bootstrap_admin
```

Запусти uvicorn под systemd (`/etc/systemd/system/candles.service`):

```ini
[Unit]
Description=CANDWAX backend (uvicorn)
After=network.target mysql.service

[Service]
WorkingDirectory=/opt/candles/backend
EnvironmentFile=/opt/candles/backend/.env
ExecStart=/opt/candles/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now candles
curl -fsS http://127.0.0.1:8000/health    # {"status":"ok","env":"production"}
```

### 4. Сборка фронта

```bash
npm ci
VITE_API_URL=https://shop.example.com npm run build
```

В `dist/` — готовая статика. Залей её в nginx root (`/var/www/candles/`).

**Важно:** `VITE_API_URL` **запекается в бандл на этапе `npm run build`**. Если
меняешь домен API — пересобирай фронт.

### 5. Reverse proxy + TLS

Пример nginx (`/etc/nginx/sites-available/candles`):

```nginx
server {
    listen 80;
    server_name shop.example.com;
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

    # API + приватные чеки + публичные загрузки — всё через бэкенд
    location /api/ {
        proxy_pass         http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Публичные загрузки можно отдавать прямо с диска (быстрее, чем через uvicorn)
    location /uploads/ {
        alias /opt/candles/backend/storage/;
        # ВНИМАНИЕ: отдавай только публичные категории. Приватные чеки лежат в
        # storage/payment-receipts — закрой их, чтобы они не утекли статикой:
        location /uploads/payment-receipts/ { deny all; return 404; }
    }
}
```

Замечания:

- Если выставляешь API на `/api/*`, собирай фронт с
  `VITE_API_URL=https://shop.example.com/api`, а в `backend/.env` укажи
  `PUBLIC_UPLOAD_URL_BASE=https://shop.example.com/uploads` и
  `BACKEND_BASE_URL=https://shop.example.com`.
- Если `/uploads/` отдаёт nginx напрямую (как выше) — **обязательно** закрой
  `payment-receipts`, иначе приватные чеки станут публичными. Проще и
  безопаснее не делать `location /uploads/` вовсе и отдавать всё через бэкенд.
- TLS-сертификаты: `sudo certbot --nginx -d shop.example.com`.

### 6. Обновление прод-версии

```bash
cd /opt/candles
git fetch --all && git checkout <tag-or-commit>

# backend
cd backend && source .venv/bin/activate
pip install -e .
alembic upgrade head
sudo systemctl restart candles

# frontend
cd /opt/candles
npm ci && VITE_API_URL=https://shop.example.com npm run build
rsync -av --delete dist/ /var/www/candles/
```

Downtime только на момент рестарта backend (1–2 сек).

### Откат

```bash
git checkout <previous-tag>
cd backend && source .venv/bin/activate
pip install -e .
# ВНИМАНИЕ: откатить миграцию вручную, если новая версия её добавила
alembic downgrade -1
sudo systemctl restart candles
# frontend — аналогично, пересобрать и rsync
```

---

## Бэкапы и восстановление

### MySQL

Раз в сутки снимать dump:

```bash
mysqldump -u candles -p --single-transaction --routines candles \
    > /backups/candles-$(date +%F).sql
```

Восстановление:

```bash
mysql -u candles -p candles < /backups/candles-2026-04-17.sql
```

### Загруженные файлы (`storage/`)

Картинки и чеки теперь живут на диске — это **единственное** их место.
Бэкапь директорию `backend/storage/` тем же инструментом, что и БД:

```bash
restic backup /opt/candles/backend/storage
# или простой rsync на другой сервер / в облако:
rsync -av --delete /opt/candles/backend/storage/ /backups/storage/
```

Рекомендую держать копию `storage/` на отдельном носителе/сервере — потеря
диска иначе теряет все картинки и чеки.

---

## Troubleshooting

### Бэкенд не стартует: ошибка подключения к MySQL

Проверь, что MySQL запущен и доступен, а `DATABASE_URL` / `DATABASE_URL_SYNC`
верны:

```bash
mysql -u candles -p -h 127.0.0.1 candles -e "SELECT 1;"
```

Частые причины: MySQL слушает только сокет (укажи `127.0.0.1` явно), не создан
пользователь/БД, неверный пароль.

### `address already in use: 8000`

На хосте уже что-то слушает порт. Останови процесс или запусти uvicorn на
другом порту: `uvicorn app.main:app --reload --port 8001` (и поправь
`VITE_API_URL`).

### Фронт логинится, но сразу выкидывает в `/auth`

Типовая причина — CORS или неправильный `VITE_API_URL`:

1. DevTools → Network → должен быть `200` от `/auth/me`. Если `CORS error` —
   добавь origin фронта в `CORS_ORIGINS` в `backend/.env` и рестартуй backend.
2. `VITE_API_URL` в `.env` = на какой URL реально отвечает бэкенд.
3. Часы на сервере и клиенте не разъехались > TTL access-токена (30 мин).

### Изображения не отображаются (404 на `/uploads/...`)

`PUBLIC_UPLOAD_URL_BASE` не совпадает с тем, как бэкенд реально доступен извне.
В dev должно быть `http://localhost:8000/uploads`; в prod — твой домен,
например `https://shop.example.com/uploads`. После правки в `.env` рестартуй
backend; старые URL в БД остаются старыми — перезалей картинки либо пропатчи
базу `UPDATE product_images SET url = REPLACE(url, 'old', 'new');`.

### Чек не открывается (403 invalid or expired link)

Подписанная ссылка на чек живёт `RECEIPT_URL_TTL_SEC` секунд (по умолчанию
300). Если истекла — просто перезагрузи страницу заявки, ссылка перевыпустится.
Если 403 сразу — проверь, что `JWT_SECRET` не менялся между выдачей ссылки и
запросом (ссылки подписаны им).

### 401 Unauthorized сразу после логина

Сверь `JWT_SECRET` между запусками — если после рестарта секрет изменился, все
старые токены инвалидны. В prod ставь его один раз и не ротируй без нужды.

### `alembic` ругается на `Table already exists`

Миграции применились частично. Проверь состояние:

```bash
alembic current
```

Если `(head)` уже отмечен — всё ок, уже накатано. Если нет — откати
(`alembic downgrade base`) и накати заново, либо применяй нужные DDL вручную.

---

## Полезные ссылки

- FastAPI docs: http://localhost:8000/docs
- `backend/README.md` — короткая шпаргалка по самому бэкенду
- `README.md` — обзор проекта
