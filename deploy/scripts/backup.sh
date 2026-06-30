#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/candwax}"
STORAGE_ROOT="${STORAGE_ROOT:-/var/lib/candwax/storage}"
DATABASE_NAME="${DATABASE_NAME:-candles}"
MYSQL_DEFAULTS_FILE="${MYSQL_DEFAULTS_FILE:-/etc/candwax/mysql-backup.cnf}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DESTINATION="${BACKUP_ROOT}/${STAMP}"

if [[ "${BACKUP_ROOT}" != /* || "${BACKUP_ROOT}" == "/" ]]; then
  echo "BACKUP_ROOT must be a safe absolute path." >&2
  exit 1
fi

if [[ ! -r "${MYSQL_DEFAULTS_FILE}" ]]; then
  echo "Missing readable MySQL defaults file: ${MYSQL_DEFAULTS_FILE}" >&2
  exit 1
fi

if [[ ! -d "${STORAGE_ROOT}" ]]; then
  echo "Missing storage directory: ${STORAGE_ROOT}" >&2
  exit 1
fi

install -d -m 0700 "${DESTINATION}"

mysqldump \
  --defaults-extra-file="${MYSQL_DEFAULTS_FILE}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --hex-blob \
  "${DATABASE_NAME}" | gzip -9 >"${DESTINATION}/database.sql.gz"

tar -C "${STORAGE_ROOT}" -czf "${DESTINATION}/storage.tar.gz" .
sha256sum "${DESTINATION}/database.sql.gz" "${DESTINATION}/storage.tar.gz" \
  >"${DESTINATION}/SHA256SUMS"

echo "Backup written to ${DESTINATION}"
echo "Copy it to a separate host or object store; this script does not delete old backups."

