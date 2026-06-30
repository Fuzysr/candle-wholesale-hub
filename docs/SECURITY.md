# CANDWAX production security profile

Application controls are only the inner layer. Volumetric DDoS, managed WAF
rules and browser/bot challenges must run before traffic reaches nginx.

## Required before production

1. Put the public domains behind Cloudflare (or an equivalent L7/L3 edge).
2. Enable managed OWASP and provider managed WAF rules, DDoS protection,
   rate limiting for `/auth/*`, `/contact`, `/orders/*` and `/inventory/webhook`.
3. Enable bot management/challenges for credential and form endpoints. Do not
   challenge API clients on the signed inventory webhook.
4. Firewall the origin to the edge provider IP ranges only. A DNS-only origin
   defeats WAF and DDoS controls. Keep MySQL and Redis on a private network.
5. Terminate TLS 1.2/1.3 at the edge, use Full (strict) TLS to the origin, enable
   automatic certificate renewal and redirect HTTP to HTTPS.
6. Include `deploy/nginx/security.conf`, set exact `TRUSTED_HOSTS` and
   `TRUSTED_PROXY_IPS`, and make nginx replace (not append user supplied)
   `X-Forwarded-For`.
7. Set a shared Redis `RATE_LIMIT_STORAGE_URI`, unique 32+ byte JWT/webhook
   secrets, an independent Fernet `MFA_ENCRYPTION_KEY`, HTTPS public URLs and
   encrypted backups. Run `alembic upgrade head`.
8. Require MFA for every administrator operationally. Enrol with
   `POST /auth/mfa/setup`, confirm with `/auth/mfa/enable`, then test a new login.

## Signed inventory webhook

Production rejects the legacy secret-only request. Send:

- `X-Webhook-Timestamp`: current Unix seconds;
- `X-Webhook-Signature`: `sha256=` plus lowercase HMAC-SHA256 hex;
- HMAC message: `<timestamp>.<exact raw request body>`;
- key: `INVENTORY_WEBHOOK_SECRET`.

Requests outside a five-minute clock window are rejected. Keep sender and
server clocks synchronized.

## Monitoring and response

Alert on bursts of 401/403/429, refresh-token reuse, WAF blocks, admin logins,
MFA changes and webhook signature failures. Never log JWTs, cookies, MFA seeds,
password-reset URLs, receipt URLs or full customer PII. Rotate secrets after an
incident and revoke all refresh-token families.

Authoritative references:

- OWASP Cheat Sheet Series: https://cheatsheetseries.owasp.org/
- Cloudflare WAF: https://developers.cloudflare.com/waf/
- Cloudflare DDoS protection: https://developers.cloudflare.com/ddos-protection/
- NGINX request limiting: https://nginx.org/en/docs/http/ngx_http_limit_req_module.html
