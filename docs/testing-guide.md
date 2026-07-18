# Testing Guide

Run commands in PowerShell from the repository root. Complete the first-time
steps in [Local development](local-development.md) before runtime or database
checks.

## Customer website

Start it:

```powershell
pnpm dev:web
```

In another PowerShell window:

```powershell
(Invoke-WebRequest http://localhost:3000).StatusCode
```

Success prints `200`. The browser page must show **Mensah Rentals Customer
Website** and **Development Environment**. Common failures are port 3000 being
occupied, dependencies not installed, or shared packages not building.

## Admin dashboard

Start it:

```powershell
pnpm dev:admin
```

Then:

```powershell
(Invoke-WebRequest http://localhost:3001).StatusCode
```

Success prints `200`. The page must show **Mensah Rentals Admin Dashboard** and
**Development Environment**. Check port 3001 and the terminal output if it does
not load.

## API

Ensure `.env` exists, Prisma Client has been generated, and then start the API:

```powershell
pnpm db:generate
pnpm dev:api
```

The terminal should report that Nest started and listens on port 4000. Missing
or invalid environment configuration causes startup validation to fail rather
than silently using unsafe values.

## API health endpoint

```powershell
Invoke-RestMethod http://localhost:4000/health
```

Success returns values equivalent to:

```text
service                status
-------                ------
mensah-rentals-api     ok
```

The response must not contain credentials, database connection information, or
stack traces.

## PostgreSQL connectivity

Start and check PostgreSQL:

```powershell
docker compose up -d postgres
docker compose ps
docker compose exec postgres pg_isready -U mensah_dev -d mensah_rentals_dev
```

Then, with the API running:

```powershell
Invoke-RestMethod http://localhost:4000/health/database
```

Success returns `status` equal to `ok` and `database` equal to `connected`.
This endpoint executes a real `SELECT 1`; unit tests with mocks are not a
substitute for this runtime check.

If PostgreSQL is stopped, the readiness endpoint should return HTTP 503 with a
sanitized unavailable status. It must not expose connection details.

## Formatting

```powershell
pnpm format:check
```

Success ends with a message that all matched files use Prettier formatting. If
it fails, run `pnpm format`, inspect the changes, and rerun the check.

## Linting

```powershell
pnpm lint
```

Success exits without errors or warnings. ESLint checks TypeScript and Next.js
code directly; it does not depend on the removed `next lint` command.

## Type checking

```powershell
pnpm typecheck
```

Success shows completed Turborepo tasks with no TypeScript errors. On a clean
checkout, database client generation runs before API/shared-package checks.

## Unit tests

```powershell
pnpm test
```

Success reports passing tests for both temporary pages and API health behavior.
Packages without Phase 1 behavior explicitly pass with no tests. These tests do
not prove that a real PostgreSQL server is reachable; use the connectivity steps
above for that.

## Production builds

```powershell
pnpm build
```

Success builds both Next.js applications, compiles the NestJS API, and builds
required shared packages. Turborepo should report all tasks successful. A build
does not prove that ports respond, so perform runtime smoke checks separately.

To smoke-test production builds, use separate PowerShell windows after a
successful build:

```powershell
pnpm --filter @mensah-rentals/web start
pnpm --filter @mensah-rentals/admin start
pnpm --filter @mensah-rentals/api start
```

Then repeat the web, admin, API health, and database-readiness requests above.

## Database schema checks

```powershell
pnpm db:validate
pnpm db:generate
```

Success reports a valid Prisma schema and a generated Prisma Client.
`db:validate` and `db:generate` do not themselves prove network connectivity.
After a later phase commits the first migration, `pnpm db:status` can also be
used to check for pending migrations against a running database.

## Complete Phase 1 verification sequence

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d postgres
docker compose ps
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

With `pnpm dev` still running, use another PowerShell window:

```powershell
(Invoke-WebRequest http://localhost:3000).StatusCode
(Invoke-WebRequest http://localhost:3001).StatusCode
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/health/database
```

Expected results are HTTP 200 from both websites, an API `ok` response, and a
database `connected` response.
