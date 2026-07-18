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

Success prints `200` after following the redirect to `/login`. The page must
show the staff login form and **Mensah Rentals Admin**. After bootstrap and a
successful login, `/` must show **Authenticated Development Environment**.
Check port 3001 and the terminal output if it does not load.

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

Success reports passing website, API health, authentication unit/integration,
admin BFF, protected-rendering, validation, and cryptography tests. These tests
do not replace the real PostgreSQL and browser checks below.

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
Run `pnpm db:status` to confirm the committed staff-authentication migration is
applied and no migrations are pending against the running database.

## Staff authentication tests

First prepare the real local database and staff user as described in
[Local development](local-development.md):

```powershell
docker compose up -d postgres
pnpm db:migrate
pnpm staff:bootstrap
pnpm dev
```

Keep that window open. In a second PowerShell window, assign the credentials
from your ignored `.env` without printing the password:

```powershell
$staffEmail = (Get-Content .env | Where-Object { $_ -like 'STAFF_BOOTSTRAP_EMAIL=*' } | Select-Object -First 1).Split('=', 2)[1]
$staffPassword = (Get-Content .env | Where-Object { $_ -like 'STAFF_BOOTSTRAP_PASSWORD=*' } | Select-Object -First 1).Split('=', 2)[1]
$loginBody = @{ email = $staffEmail; password = $staffPassword } | ConvertTo-Json
$authSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
```

Do not echo `$staffPassword` or `$loginBody`.

### Successful login and safe response

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:4000/auth/login -WebSession $authSession -Headers @{ Origin = 'http://localhost:3001' } -ContentType 'application/json' -Body $loginBody
$login.user | Select-Object id,email,firstName,lastName,status,lastLoginAt
$login | ConvertTo-Json -Depth 5 | Select-String 'passwordHash|tokenHash|rawToken'
```

Success returns an `ACTIVE` safe staff user. The final command returns no
matches. The session cookie remains inside `$authSession` and is not printed.

### Authenticated and unauthenticated `/auth/me`

```powershell
Invoke-RestMethod -Uri http://localhost:4000/auth/me -WebSession $authSession
curl.exe -i http://localhost:4000/auth/me
```

The first returns the same safe user. The second returns HTTP `401` because it
does not have the PowerShell session cookie.

### Incorrect and unknown credentials

```powershell
$wrongKnown = @{ email = $staffEmail; password = 'intentionally-wrong' } | ConvertTo-Json
$wrongUnknown = @{ email = 'unknown-user@example.test'; password = 'intentionally-wrong' } | ConvertTo-Json
curl.exe -s -i -X POST http://localhost:4000/auth/login -H "Origin: http://localhost:3001" -H "Content-Type: application/json" --data $wrongKnown
curl.exe -s -i -X POST http://localhost:4000/auth/login -H "Origin: http://localhost:3001" -H "Content-Type: application/json" --data $wrongUnknown
```

Both return HTTP `401` and the same generic `Invalid email or password`
message. They must not reveal whether the address exists. Repeated rapid tests
may correctly return `429`; wait 60 seconds before continuing.

Disabled-account behavior is covered by automated service and HTTP integration
tests because Phase 2 intentionally has no account-management UI. Those tests
verify disabled login rejection and immediate rejection of an existing session
after the user becomes disabled.

### Logout and session invalidation

```powershell
$preLogoutCookie = $authSession.Cookies.GetCookieHeader('http://localhost:4000')
Invoke-RestMethod -Method Post -Uri http://localhost:4000/auth/logout -WebSession $authSession -Headers @{ Origin = 'http://localhost:3001' } -ContentType 'application/json' -Body '{}'
curl.exe -i -b $preLogoutCookie http://localhost:4000/auth/me
```

Logout returns no body (`204`). The subsequent request deliberately replays the
pre-logout token and returns `401`, proving that the database session—not merely
the visible cookie—was invalidated. Do not print `$preLogoutCookie`.

### Protected admin route

Open http://localhost:3001 in a private browser window. It must redirect to
`/login`. Log in using the values from the ignored `.env`; it must show
**Mensah Rentals Admin** and **Authenticated Development Environment**. Click
**Sign out**, refresh `/`, and confirm it redirects to `/login` again.

Common failures are mismatched `localhost`/`127.0.0.1`, an incorrect
`ADMIN_ORIGIN`, an API that is not running, a pending migration, an account
created with older bootstrap values, or the intentional login rate limiter.

## Complete Phase 2 verification sequence

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d postgres
docker compose ps
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm staff:bootstrap
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

Expected results are HTTP 200 from the customer website and admin login page,
an API `ok` response, and a database `connected` response. Complete the staff
login, `/auth/me`, logout, and protected-admin checks above before calling the
authentication flow verified.
