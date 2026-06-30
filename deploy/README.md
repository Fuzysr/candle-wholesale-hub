# CANDWAX production deployment

The supported production shape is one public HTTPS origin:

```text
https://shop.example.com/        -> Vite dist/
https://shop.example.com/api/*   -> FastAPI on 127.0.0.1:8000
https://shop.example.com/uploads -> public storage categories only
```

Using one origin keeps HttpOnly cookies and CSRF protection simple. The
production environment should contain:

- MySQL 8;
- Redis for shared rate limits;
- nginx and TLS;
- Python 3.12 virtualenv at `/opt/candwax/backend/.venv`;
- persistent storage at `/var/lib/candwax/storage`;
- off-host backups for both MySQL and storage.

## Install the service and nginx configuration

1. Copy `systemd/candwax.service` to `/etc/systemd/system/candwax.service`.
2. Copy `nginx/proxy-common.conf` to
   `/etc/nginx/snippets/candwax-proxy-common.conf`.
3. Include `nginx/security.conf` once inside nginx's global `http {}` block.
4. Copy `nginx/candwax.conf.example` to
   `/etc/nginx/sites-available/candwax`, replace the example domain and TLS
   paths, then enable it.
5. Create persistent storage before starting the service:

   ```bash
   sudo install -d -o www-data -g www-data -m 0750 \
     /var/lib/candwax/storage/product-images \
     /var/lib/candwax/storage/company-assets \
     /var/lib/candwax/storage/payment-receipts
   ```

6. Validate before reloading:

   ```bash
   sudo systemd-analyze verify /etc/systemd/system/candwax.service
   sudo nginx -t
   sudo systemctl daemon-reload
   sudo systemctl enable candwax
   sudo systemctl reload nginx
   ```

## Required backend production values

Start from `backend/.env.example`. At minimum replace:

```dotenv
APP_ENV=production
TRUSTED_HOSTS=shop.example.com
TRUSTED_PROXY_IPS=127.0.0.1
CORS_ORIGINS=https://shop.example.com
DATABASE_URL=mysql+aiomysql://...
DATABASE_URL_SYNC=mysql+pymysql://...
JWT_SECRET=...
MFA_ENCRYPTION_KEY=...
INVENTORY_WEBHOOK_SECRET=...
RATE_LIMIT_STORAGE_URI=redis://127.0.0.1:6379/0
LOCAL_STORAGE_ROOT=/var/lib/candwax/storage
PUBLIC_UPLOAD_URL_BASE=https://shop.example.com/uploads
BACKEND_BASE_URL=https://shop.example.com/api
WEB_APP_URL=https://shop.example.com
BOOTSTRAP_ADMIN_EMAIL=...
BOOTSTRAP_ADMIN_PASSWORD=...
```

Generate each secret independently. Never commit the production `.env`.

## Deploy

Back up first, check out an immutable release tag, then run:

```bash
sudo bash deploy/scripts/backup.sh
VITE_API_URL=https://shop.example.com/api bash deploy/scripts/deploy.sh
```

After deployment verify `/health`, registration/login/logout, a test order,
admin access with MFA, an upload and restoration of a recent backup.

## MySQL backup credentials

`backup.sh` reads `/etc/candwax/mysql-backup.cnf` rather than accepting a
password on the command line:

```ini
[client]
user=candwax_backup
password=replace-with-a-secret
host=127.0.0.1
```

Restrict it with `chmod 600`. Grant the backup account only the permissions
needed by `mysqldump`.

## Persistent-data rule

Never place production uploads inside a release directory that is replaced by
`git checkout`, `rsync --delete` or rollback. `/var/lib/candwax/storage` is a
separate persistent path and must be backed up together with the database.

## Blockers before the first public release

Do not expose the site publicly until all of these are resolved:

- replace the placeholder phone, email, manager contact and postal address in
  `src/pages/Contacts.tsx`, `src/components/layout`, and
  `src/components/account/constants.ts`;
- implement approved content for `/privacy` and `/offer` (the footer links
  currently resolve to the SPA 404 page);
- configure and test SMTP delivery, Redis, TLS renewal, Cloudflare/WAF and
  off-host backups;
- enrol every administrator in MFA and test a fresh login;
- run the MySQL CI job, not only the local SQLite-compatible test suite;
- commit the migration, deploy files and media, then deploy an immutable tag.

The WebM hero is the primary video source. The MP4 fallback is currently about
9.7 MB and should be recompressed before launch if older-browser fallback
traffic matters.
