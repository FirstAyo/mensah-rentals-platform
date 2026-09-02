# Staging-first VPS deployment

This runbook adds Mensah Rentals beside Tech Arena24 without replacing the live site. It uses the one existing Caddy container as the only owner of VPS ports 80 and 443. Mensah application containers publish no host ports, PostgreSQL remains private, and staging comes before any production traffic change.

## Topology and hostnames

```text
Cloudflare -> one existing Caddy (80/443)
  |-- existing Tech Arena24 network -> Tech Arena24 app
  `-- shared caddy_proxy network
        |-- mensah-staging-web:3000
        |-- mensah-staging-admin:3001
        `-- mensah-staging-api:4000 -> private network -> PostgreSQL:5432
```

Staging uses `staging.mensahrentals.com`, `admin-staging.mensahrentals.com`, and `api-staging.mensahrentals.com`. Later production uses `mensahrentals.com`, `admin.mensahrentals.com`, and `api.mensahrentals.com`; `www.mensahrentals.com` redirects permanently to the apex. The future mobile application will call the production API hostname and will never connect directly to PostgreSQL.

Staging and production use separate checkouts, Compose project names, databases, media volumes, aliases, and secrets. Redis remains deferred because no current runtime requirement justifies it.

## Non-negotiable safety rules

- Run Mensah commands from `~/apps/mensah-rentals-staging`, not `~/apps/techarena24`, except for explicitly labelled shared-Caddy steps.
- Never start another proxy on ports 80/443.
- Never run `docker compose down -v`; `-v` deletes database and media volumes.
- Never copy development credentials/data to the VPS.
- Keep `.env` at mode `600`; never print or commit it.
- Stop if a pre-change Tech Arena24 health check fails.
- Do not create production DNS or enable production indexing until staging is accepted.

## 1. Capture a rollback checkpoint

```bash
ssh deploy@31.220.52.135
cd ~/apps/techarena24
docker compose ps
docker exec techarena24-caddy-1 caddy validate --config /etc/caddy/Caddyfile
curl -fsS -o /dev/null -w '%{http_code}\n' https://techarena24.com
curl -fsS -o /dev/null -w '%{http_code}\n' https://www.techarena24.com
cp docker-compose.yml docker-compose.yml.before-mensah
cp deploy/Caddyfile deploy/Caddyfile.before-mensah
```

Caddy validation must succeed and Tech Arena24 must return its normal live status before continuing.

## 2. Clone staging separately

These commands run from `~/apps`, not the Tech Arena24 folder:

```bash
cd ~/apps
git clone git@github.com:FirstAyo/mensah-rentals-platform.git mensah-rentals-staging
cd ~/apps/mensah-rentals-staging
git status --short
git rev-parse HEAD
```

Status should be empty. Record the commit SHA.

## 3. Create staging configuration

```bash
cp deploy/staging.env.example .env
chmod 600 .env
stat -c '%a %U:%G %n' .env
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
nano .env
```

Use the four independent random values for the database, request, quote, and order secrets. Hex needs no URL encoding, so the database value can be used identically in `POSTGRES_PASSWORD` and the password part of `DATABASE_URL`. Replace every `CHANGE_ME` and set `APP_COMMIT_SHA` to the recorded SHA. Leave these exact safeguards unchanged:

```text
NODE_ENV=production
PLATFORM_ENVIRONMENT=STAGING
SITE_URL=https://staging.mensahrentals.com
SITE_INDEXING_ENABLED=false
AUTH_COOKIE_SECURE=true
PUBLIC_CART_COOKIE_SECURE=true
PUBLIC_REQUEST_COOKIE_SECURE=true
PUBLIC_QUOTE_COOKIE_SECURE=true
PUBLIC_ORDER_COOKIE_SECURE=true
```

Verify without revealing values:

```bash
git status --short .env
git check-ignore -v .env
grep -c CHANGE_ME .env
```

The first command is empty, the second identifies `.gitignore`, and the last prints `0`.

## 4. Create and attach the shared proxy network

Create the network once:

```bash
docker network inspect caddy_proxy >/dev/null 2>&1 || docker network create caddy_proxy
docker network inspect caddy_proxy --format '{{.Name}}'
```

In `~/apps/techarena24/docker-compose.yml`, remove `env_file: .env` from only the Caddy service if it remains; Caddy does not need Tech application secrets. Attach that existing service to both networks while preserving its ports, volumes, image, and Tech routes:

```yaml
services:
  caddy:
    networks:
      - default
      - caddy_proxy

networks:
  caddy_proxy:
    external: true
    name: caddy_proxy
```

Validate and recreate only Caddy:

```bash
cd ~/apps/techarena24
docker compose config --quiet
docker compose up -d --no-deps caddy
docker compose ps
docker network inspect caddy_proxy --format '{{range .Containers}}{{println .Name}}{{end}}'
curl -fsS -o /dev/null -w '%{http_code}\n' https://techarena24.com
```

The existing Caddy container must appear on `caddy_proxy`, and Tech Arena24 must still respond.

## 5. Validate, build, migrate, and start staging

`--env-file .env` is required because Compose interpolation happens before a service's `env_file` is loaded.

```bash
cd ~/apps/mensah-rentals-staging
docker compose --env-file .env -f compose.deploy.yml config --quiet
docker compose --env-file .env -f compose.deploy.yml build migrate
docker compose --env-file .env -f compose.deploy.yml run --rm --no-deps migrate node scripts/deployment-preflight.mjs
docker compose --env-file .env -f compose.deploy.yml build api web admin
docker compose --env-file .env -f compose.deploy.yml up -d
docker compose --env-file .env -f compose.deploy.yml ps
docker compose --env-file .env -f compose.deploy.yml logs --tail=100 migrate api web admin
```

Preflight must pass for `STAGING` without printing secrets. PostgreSQL, API, Web, and Admin should become healthy. `migrate` should exit 0. No Mensah service should publish a host port.

Seed and verify RBAC:

```bash
docker compose --env-file .env -f compose.deploy.yml run --rm --no-deps migrate node packages/database/dist/scripts/seed-rbac.js
docker compose --env-file .env -f compose.deploy.yml run --rm --no-deps migrate node packages/database/dist/scripts/verify-rbac.js
```

## 6. Bootstrap the first staging operator

The operator bootstrap works only when the user table is empty, or as an idempotent retry for the same active SUPER_ADMIN. It cannot later elevate a second user.

```bash
read -rp 'Staff email: ' STAFF_BOOTSTRAP_EMAIL
read -rp 'First name: ' STAFF_BOOTSTRAP_FIRST_NAME
read -rp 'Last name: ' STAFF_BOOTSTRAP_LAST_NAME
read -rsp 'Strong staff password: ' STAFF_BOOTSTRAP_PASSWORD; echo
export STAFF_BOOTSTRAP_EMAIL STAFF_BOOTSTRAP_FIRST_NAME STAFF_BOOTSTRAP_LAST_NAME STAFF_BOOTSTRAP_PASSWORD
docker compose --env-file .env -f compose.deploy.yml run --rm --no-deps \
  -e STAFF_BOOTSTRAP_EMAIL -e STAFF_BOOTSTRAP_FIRST_NAME -e STAFF_BOOTSTRAP_LAST_NAME \
  -e STAFF_BOOTSTRAP_PASSWORD -e STAFF_BOOTSTRAP_CONFIRM_ENVIRONMENT=STAGING \
  migrate node packages/database/dist/scripts/bootstrap-operator-staff.js
unset STAFF_BOOTSTRAP_EMAIL STAFF_BOOTSTRAP_FIRST_NAME STAFF_BOOTSTRAP_LAST_NAME STAFF_BOOTSTRAP_PASSWORD
```

The success output may show the environment/email but never the password. Run RBAC verification again.

## 7. Add password-protected staging to the one Caddyfile

Generate a password hash interactively so plaintext does not enter shell history:

```bash
docker exec -it techarena24-caddy-1 caddy hash-password
```

Copy the blocks from `deploy/Caddyfile.mensah-staging.example` into `~/apps/techarena24/deploy/Caddyfile`. Replace the placeholder with the hash in the live VPS file; do not commit it. Validate before reloading:

```bash
docker exec techarena24-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec techarena24-caddy-1 caddy reload --config /etc/caddy/Caddyfile
docker logs --tail=100 techarena24-caddy-1
curl -fsS -o /dev/null -w '%{http_code}\n' https://techarena24.com
```

If validation fails, do not reload. Restore the saved Caddyfile.

## 8. Add only staging DNS in Cloudflare

Create three `A` records pointing to `31.220.52.135`:

| Name            | Initial proxy state |
| --------------- | ------------------- |
| `staging`       | DNS only            |
| `admin-staging` | DNS only            |
| `api-staging`   | DNS only            |

Do not change production records yet. DNS-only is the safest initial state for Caddy certificate issuance and matches the successful Tech Arena24 migration. Keep SSL/TLS at `Full` initially; after Caddy has valid public certificates, use `Full (strict)` if Cloudflare accepts them. The Caddy basic-auth gate protects staging even when Cloudflare is bypassed. Proxy one hostname at a time only after validation.

## 9. Verify private, non-indexable staging

Without credentials, all three hosts must return 401:

```bash
curl -I https://staging.mensahrentals.com
curl -I https://admin-staging.mensahrentals.com
curl -I https://api-staging.mensahrentals.com/health
```

With the username, let curl prompt for the password:

```bash
curl -u mensah-preview -I https://staging.mensahrentals.com
curl -u mensah-preview -I https://admin-staging.mensahrentals.com/login
curl -u mensah-preview https://api-staging.mensahrentals.com/health
curl -u mensah-preview -I https://staging.mensahrentals.com/robots.txt
curl -u mensah-preview -I https://staging.mensahrentals.com/sitemap.xml
```

Protected pages/API should return 200; sitemap must return 404. Every authenticated staging response should have `X-Robots-Tag` containing `noindex`, and robots must disallow crawling. In a browser, test staff login/logout, RBAC, catalogue/media, cart/request, private quote/order access, reports, themes, accessibility, and 320px layouts.

Confirm isolation and Tech health:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
docker network inspect caddy_proxy --format '{{range .Containers}}{{println .Name}}{{end}}'
curl -fsS -o /dev/null -w '%{http_code}\n' https://techarena24.com
```

Only Caddy should publish 80/443. Mensah PostgreSQL must not publish 5432.

## 10. Rollback

Before a Caddy change, simply stop staging:

```bash
cd ~/apps/mensah-rentals-staging
docker compose --env-file .env -f compose.deploy.yml stop
```

If a shared-Caddy change causes trouble:

```bash
cd ~/apps/techarena24
cp deploy/Caddyfile.before-mensah deploy/Caddyfile
cp docker-compose.yml.before-mensah docker-compose.yml
docker compose config --quiet
docker compose up -d --no-deps caddy
docker exec techarena24-caddy-1 caddy validate --config /etc/caddy/Caddyfile
curl -fsS -o /dev/null -w '%{http_code}\n' https://techarena24.com
```

Remove only the three staging DNS records if necessary. Do not delete volumes; stopped data is recoverable and useful for diagnosis.

## 11. Production promotion is a later approval gate

Before production:

1. Prove scheduled, encrypted off-VPS PostgreSQL and media backups with an isolated restore.
2. Resolve trusted-proxy/per-client throttling behind Cloudflare and finish the production security review.
3. Create `~/apps/mensah-rentals` at the exact accepted commit.
4. Create a separate `.env` from `deploy/production.env.example` using new production-only secrets.
5. Repeat preflight, build, migration, seed/verify, bootstrap, health, security, browser, and rollback checks with `PRODUCTION` confirmation.
6. Add `deploy/Caddyfile.mensah-production.example` and production DNS one hostname at a time only after approval.
7. Verify exact legacy redirects such as `/about/`, `/gear/`, `/contact/`, and known `/product/{slug}/` destinations; never add speculative wildcard redirects.
8. Confirm production metadata, canonical origin, robots, sitemap, structured data, private/admin noindex headers, monitoring, and backups.

`SITE_INDEXING_ENABLED=true` belongs only to the accepted production public site. The current backup tools provide strong local integrity/restore verification, but scheduled encrypted off-host retention remains a production blocker; see [Backup and restore](backup-and-restore.md).
