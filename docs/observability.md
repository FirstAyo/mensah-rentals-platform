# Operational observability

The internal admin page is `/system/status`; API endpoints are `/admin/system/status` and separately protected `/admin/system/backup-status`. `observability.view` is required for readiness and `backup.view_status` for backup metadata.

## Safe status contract

The response includes API health/uptime, validated optional version/commit, environment class, database reachability and applied/expected/failed migration counts, media read/write readiness, and a Google Reviews configured boolean. It never returns environment values, connection strings, hosts, usernames, filesystem paths, keys, tokens, raw errors, or backup files. It provides no restart, migration, backup, or restore control.

Public `/health` remains intentionally minimal and is not an administrative diagnostic endpoint. robots.txt is not relied on for protection; staff authentication and backend permissions are mandatory.

## Correlation IDs and errors

Every request receives a UUID correlation ID and `X-Request-ID` response header. An upstream header is accepted only when `TRUST_PROXY_REQUEST_ID=true` and it matches the bounded allowlist. In local development the default is false. Do not enable it on a VPS unless a trusted reverse proxy removes client-provided IDs and sets its own.

Unexpected errors and all 5xx `HttpException` values return a generic message plus request ID. Raw Prisma, filesystem, Zod, upstream, and stack details are not sent. Known controlled 4xx validation/authorization responses keep their safe status.

## Structured logging

Logs are bounded objects with event names, error class where safe, request ID, method/path, status, report key, and lifecycle signal. Implemented events include API startup/shutdown, unexpected request failure, report/audit export failure, database readiness failure, media readiness failure, and existing authentication/Google Reviews classifications. Operator backup/restore scripts emit safe outcomes without URLs or credentials.

Never log request bodies, passwords, cookies, session/capability tokens or hashes, API keys, database URLs, internal notes, CSV contents, or raw exception messages. VPS deployment should send stdout/stderr to a restricted log collector with retention and alerting; the application does not invent a distributed tracing service.

## Local verification and troubleshooting

```powershell
docker compose up -d postgres postgres-test
pnpm dev
```

Sign in at `http://localhost:3001/login`, open `http://localhost:3001/system/status`, and press Refresh. A healthy local result shows API healthy, database reachable/schema current, and media read/write. Stop ordinary servers before `pnpm test:e2e:system-status`.

If database is unavailable, confirm `docker compose ps` and `pnpm db:status`. If media is unavailable, confirm `MEDIA_STORAGE_ROOT` exists and the current user can read/write it; the UI intentionally will not reveal the path. If backup verification is unknown, run `pnpm db:restore:test` and inspect only the safe operator output. Use the request ID to correlate an admin error with API logs.
