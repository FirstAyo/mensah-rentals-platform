# Local Development on Windows

These instructions assume no prior monorepo, pnpm, Docker, or Prisma
experience. Run commands in **PowerShell** from the repository root unless a
step says otherwise.

## 1. Required software

Install:

1. **Git for Windows** from https://git-scm.com/download/win
2. **Node.js 22 LTS** from https://nodejs.org/
3. **Docker Desktop** from https://www.docker.com/products/docker-desktop/

During Docker Desktop installation, enable WSL 2 and Linux containers when
prompted. Restart Windows if the installer requests it. Open a new PowerShell
window after installing software so PATH changes are visible.

Visual Studio Code is optional.

## 2. Check Node.js

```powershell
node --version
```

Success shows `v22.x.x` or a newer compatible LTS version. If PowerShell says
`node` is not recognized, install Node.js or restart PowerShell.

Check Corepack:

```powershell
corepack --version
```

If Corepack is not available:

```powershell
npm install --global corepack
```

You may need to open PowerShell as Administrator for that one global install.
Return to a normal PowerShell window afterward.

If Corepack reports `Cannot find matching keyid`, its bundled signing keys are
out of date. Update Corepack, open a new PowerShell window, and retry:

```powershell
npm install --global corepack@latest
corepack enable
corepack prepare pnpm@10.15.1 --activate
```

## 3. Enable and check pnpm

This project pins pnpm 10.15.1.

```powershell
corepack enable
corepack prepare pnpm@10.15.1 --activate
pnpm --version
```

Success shows `10.15.1`. If `corepack enable` reports a permission error, open
PowerShell as Administrator, run only `corepack enable`, close that window, and
retry the remaining commands in a normal PowerShell window.

## 4. Check Git

```powershell
git --version
```

Success shows a Git version. If the repository has not been downloaded yet,
clone it and enter its directory before continuing.

## 5. Install dependencies

From the directory containing `package.json`:

```powershell
pnpm install
```

Success ends without an error and creates `node_modules` plus `pnpm-lock.yaml`.
Use pnpm for this repository; do not mix npm or Yarn lockfiles into it.

## 6. Open Docker Desktop

Start **Docker Desktop** from the Windows Start menu. Wait until it reports that
the Docker engine is running. Confirm both commands work:

```powershell
docker --version
docker compose version
```

Docker Desktop must be running each time local PostgreSQL is used.

## 7. Create the local environment file

Copy the safe example:

```powershell
Copy-Item .env.example .env
```

The provided values are development-only. `.env` is ignored by Git. Never
commit real passwords, tokens, or production configuration. If `.env` already
exists, do not overwrite it without first checking whether you need its local
values.

## 8. Start PostgreSQL

```powershell
docker compose up -d postgres
```

The first run downloads the PostgreSQL image. Success creates the service and
returns to the prompt. Data is retained in the Compose-managed named volume.

Redis is intentionally absent. PostgreSQL-backed sessions and the initial
single-process login limiter do not require it. Add Redis only when a concrete
distributed requirement exists.

## 9. Check PostgreSQL

```powershell
docker compose ps
```

The `postgres` service should show `running` and then `healthy`. It may display
`starting` for several seconds.

To ask PostgreSQL directly:

```powershell
docker compose exec postgres pg_isready -U mensah_dev -d mensah_rentals_dev
```

Success says the server is `accepting connections`.

## 10. Run Prisma setup

Validate the intentionally minimal schema, generate the client, and apply any
committed migrations:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate
```

Committed migrations currently cover staff authentication, RBAC, products/categories, and the Phase 5 inventory foundation. `db:migrate` should apply any missing committed migration and `db:status` should report that the schema is up to date.

Only when intentionally authoring a new development migration, use:

```powershell
pnpm db:migrate:dev -- --name descriptive_migration_name
```

Do not manually edit a production database schema.

## 11. Start all applications

```powershell
pnpm dev
```

Keep this PowerShell window open. Turborepo starts:

- Customer website: http://localhost:3000
- Admin dashboard: http://localhost:3001
- API: http://localhost:4000

Use a second PowerShell window for test commands or smoke checks.

## 12. Start applications individually

Use one command per PowerShell window:

```powershell
pnpm dev:web
```

```powershell
pnpm dev:admin
```

```powershell
pnpm dev:api
```

These root commands intentionally use Turborepo so required shared packages are
built first, including on a clean checkout. The API requires `.env` and running
PostgreSQL for its database-readiness endpoint.

## 13. Stop applications

Click the PowerShell window running an application and press `Ctrl+C`. If asked
to terminate the batch job, type `Y` and press Enter. Stopping applications does
not stop PostgreSQL.

## 14. Stop Docker services

Preserve local database data and stop the container:

```powershell
docker compose down
```

Do not add `-v` unless you intentionally want to erase local database data.

## 15. Restart local development

After Docker Desktop is running:

```powershell
docker compose up -d postgres
docker compose ps
pnpm db:migrate
pnpm dev
```

Dependencies only need another `pnpm install` when package manifests or the
lockfile change.

## 16. Safely reset the local database

> Warning: this permanently deletes all data in this repository's **local
> development** PostgreSQL volume. Never run these commands against staging or
> production. Stop the applications first and confirm PowerShell is in this
> repository root.

```powershell
docker compose down -v
docker compose up -d postgres
docker compose ps
pnpm db:migrate
```

The volume name is scoped by Docker Compose to this project. `down -v` removes
it; the next `up` creates a clean volume.

`pnpm db:reset` is also destructive and intended only for deliberate local
development use. Prefer the explicit Docker reset sequence above when a full
local reset is required.

After a reset, repeat `pnpm staff:bootstrap` after setting the four bootstrap
variables described below.

## 17. Create the first local staff user

Open the ignored `.env` in a text editor. Leave the existing database settings
in place and fill in these development-only values:

```dotenv
STAFF_BOOTSTRAP_EMAIL=your-local-staff-email@example.test
STAFF_BOOTSTRAP_PASSWORD=choose-your-own-local-password-at-least-12-characters
STAFF_BOOTSTRAP_FIRST_NAME=Your
STAFF_BOOTSTRAP_LAST_NAME=Name
```

Do not put the password in `.env.example`, a committed file, chat, test output,
or a screenshot. Then run:

```powershell
pnpm staff:bootstrap
```

Success says the development staff user was created. Running the same command
again says it already exists and leaves it unchanged. If you need to change an
existing local account, reset the disposable local database or use a future
staff-management feature; the bootstrap intentionally will not overwrite or
reactivate accounts.

## 18. Log in and log out locally

Start PostgreSQL and all applications:

```powershell
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

Open http://localhost:3001/login. Enter the email and password from your
ignored `.env`. Successful login redirects to http://localhost:3001 and shows
**Mensah Rentals Admin**, **Authenticated Development Environment**, and safe
profile information. The page never displays the password hash or session
token.

Click **Sign out**. You should return to `/login`. Refreshing `/` must redirect
back to login. Opening `/` in a private browser window must also redirect.

## 19. Authentication environment settings

The safe development defaults in `.env.example` are:

- `STAFF_SESSION_COOKIE_NAME=mensah_staff_session`
- `STAFF_SESSION_TTL_HOURS=12`
- `AUTH_COOKIE_SECURE=false` because local URLs use HTTP
- `AUTH_LOGIN_RATE_LIMIT=5`
- `AUTH_LOGIN_RATE_WINDOW_SECONDS=60`
- `ADMIN_ORIGIN=http://localhost:3001`

The admin server optionally accepts
`API_INTERNAL_URL=http://localhost:4000`; that is also its local default.
Production must use HTTPS, `AUTH_COOKIE_SECURE=true`, a `__Host-` cookie name,
and exact production admin/API URLs. See [Staff authentication](authentication.md).

## 20. Troubleshooting Windows and authentication issues

### A command is not recognized

Close and reopen PowerShell after installation. Confirm the tool is installed
and on PATH. Run `node --version`, `pnpm --version`, `git --version`, and
`docker --version` separately to identify the missing tool.

### Docker cannot connect to the engine

Open Docker Desktop and wait for it to finish starting. Confirm it is using
Linux containers and WSL 2. In Docker Desktop settings, verify WSL integration
is enabled for your distribution.

### A port is already in use

Check the relevant port:

```powershell
Get-NetTCPConnection -LocalPort 3000
Get-NetTCPConnection -LocalPort 3001
Get-NetTCPConnection -LocalPort 4000
Get-NetTCPConnection -LocalPort 5432
```

Stop the conflicting application or Windows PostgreSQL service. If PostgreSQL
must use another host port, update both `POSTGRES_PORT` and the port in
`DATABASE_URL` inside `.env` so they match.

### PostgreSQL remains unhealthy

```powershell
docker compose logs postgres
```

Check `.env`, port conflicts, and available disk space. A password change does
not update an already initialized volume; reset the local volume only if losing
local development data is acceptable.

### Prisma cannot find DATABASE_URL

Confirm `.env` exists in the repository root:

```powershell
Test-Path .env
```

If it returns `False`, run `Copy-Item .env.example .env`. Run Prisma commands
through the documented root `pnpm db:*` scripts so the root file is loaded
explicitly.

### PowerShell execution policy blocks a command

Prefer the signed Node.js/Corepack installation and a normal PowerShell window.
Ask your system administrator before changing a managed execution policy. Do not
disable security controls globally merely to run the project.

### Line-ending warnings

Git may mention LF/CRLF conversion on Windows. This is normally harmless. Do
not run bulk line-ending rewrites unless the team intentionally adopts a new
repository policy.

### Login always says the email or password is invalid

Confirm the email/password are the values in your ignored `.env`, then rerun
`pnpm staff:bootstrap`. Existing users are not changed by rerunning it. If the
account was created with different values, only reset the disposable local
database when losing local data is acceptable, then migrate and bootstrap
again.

### Login returns 403 Request origin is not allowed

Use exactly http://localhost:3001 rather than another hostname or port. Confirm
`ADMIN_ORIGIN=http://localhost:3001`, stop `pnpm dev`, and restart it after an
environment change.

### Login returns 415 JSON requests are required

Use the admin login form or send `Content-Type: application/json`. Form-encoded
direct API requests are intentionally rejected.

### Login returns 429 Too Many Requests

Wait for the development rate-limit window (60 seconds by default). Do not
raise production limits without a security review.

### Login returns Authentication service is unavailable

Confirm the API is running on port 4000 and
`Invoke-RestMethod http://localhost:4000/health` succeeds. Check
`API_INTERNAL_URL` if you overrode it.

### Login succeeds but the protected page redirects back to login

Use only `localhost` consistently; mixing `127.0.0.1` and `localhost` changes
cookie hosts. Clear cookies for localhost, confirm the cookie name matches in
the API and admin environment, and restart both applications.

## 21. Apply and test Phase 4 products and categories

Open Docker Desktop, then run from the repository root:

```powershell
pnpm install
docker compose up -d postgres
docker compose ps
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm staff:bootstrap
pnpm catalogue:seed
pnpm catalogue:seed
```

Migration status should include `20260718130000_product_category_foundation`. The first catalogue seed creates missing samples; the second creates zero. Start everything with `pnpm dev`.

Sign in at `http://localhost:3001/login` using credentials stored only in the ignored `.env`. `SUPER_ADMIN` and `EDITOR` can manage `/products` and `/categories`; `SALES_PERSON` can view them but cannot mutate them by default. Public pages require no login: `/rentals`, `/rentals/seating`, and `/rentals/seating/folding-chair`.

```powershell
Invoke-RestMethod http://localhost:4000/public/categories
Invoke-RestMethod http://localhost:4000/public/products
(Invoke-WebRequest http://localhost:3000/rentals).StatusCode
(Invoke-WebRequest http://localhost:3000/sitemap.xml).StatusCode
(Invoke-WebRequest http://localhost:3000/robots.txt).Content
```

Use the header sun/moon buttons. With no saved preference, the apps follow Windows; a manual choice persists per application. Local `SITE_INDEXING_ENABLED=false` intentionally disallows crawling. A 409 while deactivating a category means its active products must be deactivated first.

On a product edit page, choose a JPEG, PNG, or WebP image of at most 10 MB and add descriptive alt text. The browser shows original and optimized sizes, then uploads the optimized WebP. The API validates and normalizes it again. Up to four images are allowed. Local files are written below `MEDIA_STORAGE_ROOT=storage/media`, which is ignored by Git.

## 22. Apply and seed Phase 3 RBAC

From the repository root, with Docker Desktop open and PostgreSQL healthy:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
```

Successful migration status says the database schema is up to date. The seed reports `4 system roles` and `45 permissions`. Verification reports an idempotent seed.

To create the first staff user and ensure that the local development account has `SUPER_ADMIN`, set the existing `STAFF_BOOTSTRAP_*` values in `.env`, then run:

```powershell
pnpm staff:bootstrap
pnpm rbac:verify
```

Credentials come only from your ignored `.env`; never put the actual password in a command, document, test, or committed file. Bootstrap is repeatable. A missing user is created with `SUPER_ADMIN`; an active existing user receives it only when that user has zero roles; users with any role and disabled users are unchanged.

Start the API and admin application:

```powershell
pnpm dev:api
```

In a second PowerShell window:

```powershell
pnpm dev:admin
```

Open `http://localhost:3001/login`, sign in with `STAFF_BOOTSTRAP_EMAIL` and `STAFF_BOOTSTRAP_PASSWORD`, and confirm the page shows `Super Admin`, `45 effective permissions`, and all development navigation placeholders.

To test another role without a role-management UI, create a second disposable local account safely:

1. Keep the first bootstrap account signed in as `SUPER_ADMIN`.
2. Temporarily change the four `STAFF_BOOTSTRAP_*` values in your ignored `.env` to a second local-only identity and password.
3. Run `pnpm staff:bootstrap`. Because the account is new, it receives `SUPER_ADMIN`; the first account remains the other active super administrator.
4. Sign in as the second account and call `GET http://localhost:4000/auth/me` to copy its user ID. Sign back in as the first account.
5. Call `GET http://localhost:4000/admin/roles` to copy the desired role ID.
6. Send `PUT http://localhost:4000/admin/users/<secondUserId>/roles` with JSON `{ "roleIds": ["<roleId>"] }`, the first account's staff cookie, `Content-Type: application/json`, and `Origin: http://localhost:3001`.
7. Sign in as the second account and refresh the admin page. Its role, permission count, and placeholder navigation must reflect the assigned role.
8. Restore your original `STAFF_BOOTSTRAP_*` values in `.env`. Keep local credentials out of source control.

Do not remove `SUPER_ADMIN` from the last active super administrator; the API returns 409. If the seed fails, first confirm the Phase 3 migration is applied. If an RBAC request returns 401, sign in again. A 403 means the current user is authenticated but lacks the required permission. A 400 usually means an invalid/duplicate ID or unknown payload field.

## 23. Apply and test Phase 5 inventory

With Docker Desktop running:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm dev
```

Open `http://localhost:3001/inventory`. `SUPER_ADMIN` and `ADMIN` can create BULK or SERIALIZED inventory. BULK setup requires a positive initial quantity. SERIALIZED setup starts empty and assets are added individually. State movements require a reason and create append-only history.

Expected permission behavior:

- `EDITOR` has no inventory access.
- `SALES_PERSON` can view metadata and confidential quantities but cannot adjust or view transaction history by default.
- `ADMIN` and `SUPER_ADMIN` have all four inventory permissions.

The values shown are current operational states, not availability for requested rental dates. No reservation is created.

## 24. Test the Phase 6 customer catalogue

Install dependencies and the browser used by the responsive/accessibility suite:

```powershell
pnpm install
pnpm --filter @mensah-rentals/web exec playwright install chromium
```

With Docker Desktop open, prepare the existing database and public samples:

```powershell
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm catalogue:seed
pnpm dev
```

Open `http://localhost:3000`, `/rentals`, `/rentals/seating`, and `/rentals/seating/folding-chair`. Test search, category selection, featured-only filtering, all four sort options, clear filters, numbered pagination when enough products exist, light/dark theme persistence, and keyboard focus beginning with the skip link.

In another PowerShell window, run:

```powershell
pnpm test:e2e
```

The suite uses Chromium at 320, 390, 768, 1024, 1440, and 1920 pixels. It starts the applications automatically unless they are already running. PostgreSQL must be running and migrations/sample data must already be prepared. On the first local checkout, the separate Playwright install command is required because browser binaries are not stored in Git.

Public pages must never show equipment quantities, asset/serial numbers, internal availability, or automatic pricing. Search/filter query variants should be noindex; clean catalogue and unfiltered page URLs keep their documented canonicals.

## 25. Run the Phase 7 guest rental cart

From the repository root in PowerShell, ensure Docker Desktop is open and run:

```powershell
docker compose up -d postgres
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm catalogue:seed
pnpm dev
```

Migration `20260723170000_rental_cart_foundation` must appear as applied. Keep
`pnpm dev` running, then open `http://localhost:3000/rentals`. Open a product,
enter a desired quantity, and select **Add to rental cart**. The header badge
should become 1. Open `http://localhost:3000/cart`, change the quantity,
refresh, navigate away and back, remove the item, and test the clear-cart
confirmation. The cart is anonymous; do not sign in.

The ignored `.env` should contain the values copied from `.env.example`:

```text
PUBLIC_CART_COOKIE_NAME=mensah_rental_cart
PUBLIC_CART_TTL_DAYS=30
PUBLIC_CART_COOKIE_SECURE=false
```

Use `Secure=false` only for local HTTP. Production requires HTTPS,
`PUBLIC_CART_COOKIE_SECURE=true`, and a name beginning `__Host-`. Never place
the cart capability in JavaScript, localStorage, a URL, source code, or logs.

A first `GET` returns an empty cart without creating a database row. The first
successful item mutation creates it. Desired quantity 100 must be accepted even
when internal inventory is smaller; the screen must not show how much Mensah
Rentals owns or has available.

Common failures:

- **403 on mutation:** use `http://localhost:3000`, not `127.0.0.1`, and ensure
  `WEB_ORIGIN` matches exactly.
- **415:** the BFF and API require JSON mutations.
- **Cart becomes empty:** the cookie may have expired, been cleared, or changed
  name after `.env` was edited.
- **Cart service unavailable:** confirm API port 4000 and PostgreSQL are running.
- **Product not listed:** seed the catalogue and use an active product in an
  active category.
- **Prisma DLL rename error:** stop leftover `pnpm dev` processes, then rerun
  `pnpm db:generate`.

## 26. Run the Phase 8 guest rental-request flow

Open Docker Desktop. From the repository root in PowerShell, run:

```powershell
docker compose up -d postgres
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm catalogue:seed
pnpm dev
```

Migration `20260724110000_rental_request_foundation` must be applied. Copy the
Phase 8 values from `.env.example` into your ignored `.env` if it predates this
phase:

```text
PUBLIC_REQUEST_COOKIE_NAME=mensah_rental_request
PUBLIC_REQUEST_COOKIE_SECURE=false
PUBLIC_REQUEST_TRACKING_TTL_DAYS=180
PUBLIC_REQUEST_TRACKING_SECRET=choose-a-long-local-development-secret
PUBLIC_REQUEST_SUBMIT_RATE_LIMIT=5
PUBLIC_REQUEST_SUBMIT_RATE_WINDOW_SECONDS=3600
PUBLIC_REQUEST_TRACK_RATE_LIMIT=60
PUBLIC_REQUEST_TRACK_RATE_WINDOW_SECONDS=60
PUBLIC_REQUEST_GLOBAL_RATE_LIMIT=10000
PUBLIC_REQUEST_GLOBAL_RATE_WINDOW_SECONDS=60
```

Do not reuse the example tracking secret outside local development. Keep
`Secure=false` only for local HTTP. Production uses HTTPS, a strong secret,
`PUBLIC_REQUEST_COOKIE_SECURE=true`, and an `__Host-` cookie name.

Open `http://localhost:3000/rentals`, add a product, then open `/cart` and choose
**Continue to rental request**. Enter contact/project/dates, select pickup or
delivery, review, and submit. The confirmation must show an
`MR-YYYY-XXXXXXXXXX` reference and “Request submitted.” It must also say that
the request is not approved, reserved, or a final quote. Refreshing the status
page in the same browser should work. Opening the same reference in a private
browser should show the generic unavailable response.

Common failures:

- **403:** use `http://localhost:3000` and ensure `WEB_ORIGIN` exactly matches.
- **415:** submit JSON through the website BFF.
- **Cart unavailable:** the cart cookie expired/changed, the cart was already
  consumed, or PostgreSQL/API is not running.
- **Product no longer listed:** return to the cart and remove the inactive item.
- **Request unavailable after copying the reference:** tracking also needs the
  original browser's HttpOnly capability; the reference is intentionally not a
  password.
- **429:** the configured local attempt limit was reached; wait for its window
  or restart the single local API process during development.
