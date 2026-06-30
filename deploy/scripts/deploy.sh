#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/candwax}"
FRONTEND_ROOT="${FRONTEND_ROOT:-/var/www/candwax}"
SERVICE_NAME="${SERVICE_NAME:-candwax}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8000/health}"

: "${VITE_API_URL:?Set VITE_API_URL, for example https://shop.example.com/api}"

if [[ ! -f "${APP_ROOT}/backend/.env" ]]; then
  echo "Missing ${APP_ROOT}/backend/.env" >&2
  exit 1
fi

if [[ ! -x "${APP_ROOT}/backend/.venv/bin/python" ]]; then
  echo "Missing backend virtualenv: ${APP_ROOT}/backend/.venv" >&2
  exit 1
fi

cd "${APP_ROOT}"

# Build first: a frontend or dependency failure must happen before migrations.
# The full test gate belongs in CI before an immutable release tag is created.
npm ci
VITE_API_URL="${VITE_API_URL}" npm run build
test -f dist/index.html

"${APP_ROOT}/backend/.venv/bin/python" -m pip install \
  --disable-pip-version-check \
  "${APP_ROOT}/backend"

cd "${APP_ROOT}/backend"
"${APP_ROOT}/backend/.venv/bin/python" -m alembic upgrade head

sudo install -d -o www-data -g www-data "${FRONTEND_ROOT}"
sudo rsync -a --delete "${APP_ROOT}/dist/" "${FRONTEND_ROOT}/"
sudo systemctl restart "${SERVICE_NAME}"

for _ in {1..20}; do
  if curl --fail --silent --show-error "${HEALTH_URL}" >/dev/null; then
    echo "Deploy complete; health check passed."
    exit 0
  fi
  sleep 1
done

echo "Backend health check failed after deploy." >&2
sudo systemctl status "${SERVICE_NAME}" --no-pager >&2 || true
exit 1
