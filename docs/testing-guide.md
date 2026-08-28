# Testing Guide

## Phase 18.4 SEO tests

Start Docker Desktop, then run:

```powershell
docker compose up -d postgres postgres-test
pnpm seo:audit
pnpm test:e2e:seo
```

Success means the audit prints the number of public pages, active categories, and active products checked. The browser suite verifies production-origin canonical/Open Graph/JSON-LD output, sitemap and robots safety, query noindex, private response headers, true 404s, inactive/tombstoned exclusions, responsive overflow, and serious/critical Axe findings.

Run the full regression set:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:seo
pnpm test:e2e:homepage-all
pnpm test:e2e:public-navigation
pnpm test:e2e:customer-orders
pnpm test:e2e:official-pdfs
pnpm test:e2e:inventory-management
pnpm db:integrity
pnpm rbac:verify
git diff --check
```

Manually review `/`, `/rentals`, one category, two products, `/privacy`, `/terms`, one private customer page, an unknown route, `/sitemap.xml`, and `/robots.txt`. Public head output must use `https://mensahrentals.com`, include one meaningful H1, and contain no localhost, capability, staff, inventory, price, Offer, or availability data. Private responses must be noindex/private. Unknown and inactive catalogue URLs must return HTTP 404.

## Phase 18.3 inventory-management tests

Run the guarded browser suite with normal development servers stopped:

```powershell
docker compose up -d postgres-test
pnpm test:e2e:inventory-management
pnpm test:e2e:admin-notifications
```

Success means the 320px project passes bulk stock addition, safe metadata edit, dark-theme persistence, no horizontal overflow, and zero serious/critical Axe findings. The 1440px project passes custom-dialog cancel/confirm and focus restoration, hard-delete eligibility, archive/filter/restore, serialized-asset creation, customer confidentiality, containment, and Axe checks. PostgreSQL integration tests prove active-reservation reduction blocking, concurrent reduction safety, exact replay, and consumed-history archival. The harness must state that it is using `mensah_rentals_test`; refusal to run usually means a normal app is still using ports 3000, 3001, or 4000, Docker Desktop is stopped, or test environment variables do not target the guarded database.

Then run:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:integrity
pnpm rbac:verify
git diff --check
```

Successful stock-operation tests prove exact deltas, immutable transaction/audit evidence, reservation/rental non-mutation, retry idempotency, conflicting operation rejection, and concurrent balance safety. Regression verification also includes reservations, fulfilment, returns, maintenance, official PDFs, customer orders, and public catalogue contracts.

## Reservation shortfall correction

Run `pnpm test:e2e:reservation-shortfall` from the repository root after stopping normal development servers. The guarded harness resets only the local `_test` database and checks partial-reservation controls, 320px layout, persisted dark mode, keyboard dialog behavior, and Axe serious/critical results. `pnpm test` additionally proves zero-stock coverage, external-only checkout/return, and owned-inventory non-mutation. See [Reservation shortfall coverage](reservation-shortfall-coverage.md).

## Phase 17 maintenance and inspection verification

All destructive fixtures must use the guarded local `_test` PostgreSQL database. Stop ordinary applications on ports 3000, 3001, and 4000, then run from PowerShell:

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:maintenance
pnpm test:e2e:inspections
pnpm test:e2e:maintenance-all
pnpm test:e2e:admin-reservations
pnpm test:e2e:admin-fulfilment
pnpm test:e2e:returns
pnpm test:e2e:catalogue
pnpm test:e2e:products
pnpm test:e2e:categories
pnpm test:e2e:cart
pnpm test:e2e:homepage-all
git diff --check
```

Successful database/static results mean every command exits with code zero, Prisma reports every additive migration applied, RBAC seeding/verification is idempotent, TypeScript has no errors, lint has no warnings, all tests pass, and all three production applications build.

The focused API/database suite directly proves permission routing, inventory
conservation, idempotent creation, concurrent bulk exclusion, explicit manual
source-state selection, active-inspection ownership exclusion,
post-maintenance pass/fail behavior, and public DTO confidentiality. The
following is the complete release checklist; items not represented by a named
automated case must also be performed manually and recorded before deployment:

- exact 401/403/authorized permission behavior and immediate disable/revocation;
- globally idempotent operation replay and conflicting reuse rejection;
- legal work-order/inspection state machines and terminal immutability;
- active bulk claims cannot exceed live state and serialized assets cannot own conflicting active work;
- return/issue sources remain immutable and an existing maintenance disposition does not move twice;
- every physical movement has one linked inventory transaction and physical total is conserved;
- reservation/preparation commitments prevent unsafe preventive withdrawal;
- post-maintenance failure returns work to progress without making equipment rentable;
- pass plus explicit completion returns equipment to service exactly once;
- linked issue resolution is explicit and immutable;
- product/category removal retains maintenance history through tombstoning;
- recursive public/customer DTOs contain no maintenance, inspection, staff, asset, operation, note, condition, priority, or inventory information.

The focused Phase 17 browser suite automates manual preventive bulk work, exact
serialized concurrency, post-maintenance inspection/completion, a failed
inspection followed by rework and a second passing inspection, read-only and
Sales permission boundaries, disabled-user rejection, dashboard workload
visibility, keyboard dismissal/focus restoration, dark-theme persistence,
320px and 1440px layouts, no page-level horizontal overflow, and
serious/critical Axe checks. The API/database suites cover canonical operation
replay/conflict handling, while the service enforces immutable return/issue
source rules. Before
deployment, manually verify the complete returned-damage-to-explicit-issue-
resolution walkthrough and repeated physical pointer double-clicks; do not
infer those two manual observations from the focused browser command alone.

Manual conservation check: capture the target's `RENTABLE`, `MAINTENANCE`, and `DAMAGED` balances before creation and after completion. State buckets may move, but their sum and the exact serialized asset ID must not change. Existing development/demo records and all media hashes must match the pre-phase preservation baseline after verification. The ignored `.env.phase17-backups/20260808-phase17/post-verification.txt` records the completed before/after database and media comparison for this implementation run.

## Phase 16.4.1 Google Reviews verification

All automated Google calls are mocked and use only the guarded `_test` database. Stop any processes already using ports 3000, 3001, or 4000 before browser tests.

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:homepage-google-reviews
pnpm test:e2e:homepage-all
git diff --check
```

Success means:

- schema validation/generation succeed and Prisma reports all migrations applied;
- RBAC reports the seeded roles/permissions including `homepage.google_reviews.view_status`;
- formatting, lint, type checking, unit/integration tests, and production builds exit with code 0;
- the focused browser command runs separate mocked live, timeout, and quota scenarios;
- live tests show rating/count, three ordered cards, authors/avatars, individual source links, Google Maps attribution, dark mode, 320px/1440px layouts, and zero serious/critical Axe violations;
- timeout/quota tests show the truthful fallback with no invented rating or review;
- admin tests show configuration status and a safe connection result without credentials;
- no browser test contacts Google or the development database.

Common failures include occupied ports, Docker Desktop not running, a missing guarded test database, or stale generated workspace output. Resolve those conditions and rerun; do not reset the development database. A real credential connection is optional and must be performed manually through the admin status panel. Never print or paste the key or raw response into test output.

## Phase 16.4A homepage correction verification

Run from PowerShell at the repository root:

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:homepage
pnpm test:e2e:homepage-admin
pnpm test:e2e:homepage-media
pnpm test:e2e:homepage-all
git diff --check
```

Success means all 45 migrations apply from empty guarded test storage, RBAC verifies, static/build gates exit 0, and the automated suite proves ordered multi-slide serialization, disabled-slide exclusion, dual-source media reuse without copying/deletion, category-cover assignment/fallback, exact permissions, immutable history, and public confidentiality. Browser success proves three-image save/preview/publish, manual and autoplay controls, reusable product selection/search, category covers, fixed desktop navigation, mobile focus restoration, shared bottom actions, consistent 44/104-pixel controls, dark-theme persistence, no horizontal overflow, and zero serious/critical Axe violations.

Never point the browser harness or automated fixtures at the development, staging, or production database. A failure saying ports are occupied means stop `pnpm dev` before retrying. A 409 in the editor means the revision lock changed; reload rather than overwriting newer content. A 403 means the staff account lacks one of the exact media/category permissions.

## Phase 16.4 homepage verification

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:homepage
pnpm test:e2e:homepage-admin
pnpm test:e2e:homepage-google-reviews
pnpm test:e2e:homepage-all
git diff --check
```

Success means 44 migrations are current, RBAC reports 4 roles and 79 permissions, every command exits 0, the homepage is usable at 320px and desktop in both themes, serious/critical Axe findings are zero, draft copy remains private until publication, and public responses contain no inventory, staff, draft, storage, or Google-secret data. Stop normal servers on ports 3000, 3001, and 4000 before the guarded browser commands.

## Phase 16.1 focused regression checks

From the repository root in PowerShell, start both guarded PostgreSQL services,
then run the amendment and reservation suites:

```powershell
docker compose up -d postgres postgres-test
pnpm test:e2e:amendments
pnpm test:e2e:reservations
```

The amendment suite must show the friendly reason-field message for an empty or
whitespace-only reason, submit trimmed text, serialize blank optional fields as
`null`, and never render a raw `String must contain` message. The reservation
suite must find the Inventory reservation section on the confirmed-order page,
preview exact full and shortfall quantities, require the internal partial
reason, complete full and partial paths, retain dark-theme and 320px behavior,
and report no serious or critical Axe violations. Both suites use test-owned
fixtures; do not point their guarded database variables at development,
staging, or production databases.

## Phase 15 fulfilment testing (Windows PowerShell)

Run database and quality checks from the repository root:

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Successful commands exit with code 0. Prisma reports a valid schema and all migrations applied; RBAC verification reports no missing mapping; formatting/lint/typecheck report no errors; tests report passed suites; all three applications build.

Install the browser once:

```powershell
pnpm --filter @mensah-rentals/web exec playwright install chromium
```

Stop normal development servers before isolated browser suites, then run:

```powershell
pnpm test:e2e:admin-fulfilment
pnpm test:e2e:active-rentals
pnpm test:e2e:fulfilment-concurrency
pnpm test:e2e:fulfilment
```

The harness refuses occupied ports, requires the isolated marker, resets only a database whose name ends in `_test`, creates random local staff/test-owned request/quote/order/reservation/inventory/fulfilment data, and terminates its processes in `finally`. Never point `TEST_DATABASE_URL` at development, staging, or production.

Expected browser behaviour: a reserved order can start/finish preparation; ready state follows active reserved quantities; atomic handoff creates one partial/full active rental; desktop delivery and exact serialized-asset checkout succeed; customer status contains no internal inventory data; `/active-rentals` and its handoff detail render; dark mode, 320px width, and accessibility checks pass; duplicate operation replay creates no second aggregate or movement. PostgreSQL integration coverage also verifies that a fully consumed partial reservation can be completed later, prepared, and checked out into the same active rental without changing total physical quantity.

Manual ledger check: before/after checkout, total physical quantity is unchanged, reserved decreases, `RENTED` increases, and an inventory transaction references the fulfilment operation. Expected return does not create a return or change inventory.

## Phase 14 reservation testing

Run static, database, seed, and browser verification from PowerShell:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm test:e2e:admin-reservations
pnpm test:e2e:reservation-concurrency
pnpm test:e2e:reservations
```

Successful database tests prove eligibility, permission independence,
half-open overlap behavior, bulk capacity locking, partial/shortfall completion,
serialized exclusion constraints, release/idempotency, immutable order data,
dashboard counts, and recursively safe public DTOs. Browser success shows a
staff-only Reservation panel, explicit quantities, intentional confirmation,
conflict handling, theme/320px behavior, and no serious accessibility findings.

The browser harness must report that it selected a local database ending in
`_test`. It refuses occupied application ports and unsafe/remote databases.
Do not run destructive reservation tests against development, staging, or
production data.

## Phase 13 amendment and change-request testing

Start Docker Desktop and run the guarded database setup first:

```powershell
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
```

Run the complete quality gate:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run the focused browser suites only against the guarded local test database:

```powershell
pnpm test:e2e:customer-amendments
pnpm test:e2e:admin-amendments
pnpm test:e2e:change-requests
pnpm test:e2e:amendments
```

Successful tests prove request reference/name/project values alone cannot amend, a request-scoped capability cannot cross requests, invalid access fails uniformly, the full add/remove/increase/decrease/unchanged list is snapshotted, revision numbers/current pointers are atomic, retries are idempotent, stale revisions conflict, decisions and quotes become historical without deletion, accepted quotes/orders require a formal change request, and all inventory/reservation/transaction counts remain unchanged.

Manual UI checks: test the amendment and comparison pages at 320px and desktop widths, keyboard-only, in light and dark themes. Confirm explicit text labels describe changes without relying on color; submission disables during a request; no horizontal scrolling appears; no inventory availability is displayed; and logout still invalidates staff access.

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
Run `pnpm db:status` to confirm all committed migrations through `20260723133000_inventory_creation_operation_required` are applied and none are pending.

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

## Phase 3 RBAC verification

Run the complete automated and database-aware sequence from the repository root:

```powershell
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:seed
pnpm staff:bootstrap
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Successful database behavior:

- Migration `20260718090000_role_based_access_control` is applied and status is up to date.
- Both seed runs report four system roles and 45 unique permissions; counts do not grow.
- `rbac:verify` confirms the seed is idempotent and `SUPER_ADMIN` has the complete catalogue.
- Bootstrap reports created, assigned, or unchanged without making a duplicate assignment.

Successful automated behavior includes catalogue/mapping checks, duplicate/invalid payload rejection, authentication 401 versus authorization 403, permitted request success, disabled-session rejection, response-field safety, logout invalidation, and permission-aware navigation visibility.

For manual API checks, sign in at `http://localhost:3001/login`, then use the session cookie in an API client. Browser state-changing requests must include `Origin: http://localhost:3001`.

- Without a cookie, `GET /admin/roles` returns 401.
- A signed-in user without `role.view` receives 403.
- A user with `role.view` receives 200 and safe role summaries.
- `GET /auth/me` lists safe role summaries and sorted effective permission keys; its JSON contains none of `passwordHash`, `tokenHash`, or a raw session token.
- An `EDITOR` lacks `inventory.quantity.view`; a `SALES_PERSON` lacks `user.role.manage`; `SUPER_ADMIN` has all 45 keys.
- Removing a non-protected role changes `/auth/me` and admin navigation on the next request; restoring it reverses the change.
- Trying to edit `SUPER_ADMIN` permissions or remove the last active super administrator returns 409.
- Logout returns 204; the old cookie then receives 401 and refreshing admin redirects to `/login`.

Common failures: 401 means the session is absent/expired, 403 means insufficient permission, 404 means a role/user/permission ID does not exist, 409 means a protected super-admin invariant was triggered, and 400 means strict validation rejected the payload.

## Phase 4 catalogue, theme, and SEO verification

```powershell
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm staff:bootstrap
pnpm catalogue:seed
pnpm catalogue:seed
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Success means the Phase 4 migration is applied, the second catalogue seed creates zero records, and every quality command exits 0. Tests cover strict input validation, real-PostgreSQL seed/slug behavior, public confidentiality, 401/403/authorized routes, and auth/RBAC regressions.

With `pnpm dev` running, verify:

```powershell
Invoke-RestMethod http://localhost:4000/public/categories
Invoke-RestMethod http://localhost:4000/public/products
(Invoke-WebRequest http://localhost:3000/rentals).StatusCode
(Invoke-WebRequest http://localhost:3000/rentals/seating).StatusCode
(Invoke-WebRequest http://localhost:3000/rentals/seating/folding-chair).StatusCode
(Invoke-WebRequest http://localhost:3000/sitemap.xml).StatusCode
(Invoke-WebRequest http://localhost:3000/robots.txt).StatusCode
```

All return 200 after the development seed. Search, pagination, active/category filters, and allowlisted sorting execute on the API. Inactive content is absent publicly; a nested category/product mismatch is 404. Public JSON must contain none of the documented inventory quantity keys, and JSON-LD must contain no Offer, price, availability, rating, or review.

## Phase 5 media and inventory verification

Run:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Success means the inventory migration is current and every quality command exits 0. Automated tests cover Sharp resizing/compression and content inspection, source/processed limits, EXIF normalization, four-image enforcement, public media URLs, real catalogue queries, inventory authorization, nonnegative concurrency-safe bulk movements, serialized state transitions, idempotency, append-only database triggers, and public catalogue confidentiality after inventory exists.

Manual checks:

1. Sign in at `http://localhost:3001/login` as the local bootstrap user.
2. Edit a product, upload a large valid image, and verify the processed preview and size appear before upload.
3. Confirm the image renders publicly without exposing a disk path.
4. Open `/inventory`, create a BULK record, and move part of the rentable quantity to maintenance.
5. Confirm totals change and history retains the original event.
6. Create SERIALIZED inventory for another product, add an asset, and verify its current state.
7. Confirm public catalogue/API/HTML contains no quantities, asset numbers, serial numbers, stock wording, or availability claims.

Common failures are Docker Desktop not running, a pending migration, missing `MEDIA_STORAGE_ROOT`, insufficient staff permissions, or a selected image exceeding the 10 MB source or 2 MB processed limits.

## Phase 6 customer catalogue verification

Prepare the database and browser once:

```powershell
docker compose up -d postgres
pnpm db:migrate
pnpm catalogue:seed
pnpm --filter @mensah-rentals/web exec playwright install chromium
```

Run the complete automated gate:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`test:e2e` succeeds when all Chromium projects pass at 320, 390, 768, 1024, 1440, and 1920-pixel widths. It checks horizontal reflow, serious/critical axe violations, skip-link and labelled-control access, combined filter URL state, manual theme persistence, product gallery semantics, and absence of customer-visible inventory claims. Common failures are Chromium not installed, PostgreSQL/API unavailable, seed data missing, or ports 3000/3001/4000 already used by unrelated applications.

Manually confirm:

1. Search, category, featured, and sort filters execute together and reset to page 1.
2. Pagination retains active filters and marks the current page.
3. Invalid page/sort values do not crash the website; the API rejects unknown/admin query fields with 400.
4. Product detail shows up to four ordered images with keyboard-operable thumbnails and related same-category products.
5. Theme selection remains after reload and controls remain readable in both modes.
6. Filtered variants are noindex with clean canonicals; unfiltered page 2 self-canonicalizes.
7. Public API, HTML, and JSON-LD contain no inventory, quantity, asset, serial, price, Offer, rating, review, or availability data.

In a private browser, admin pages redirect to login. After login, test exact role permissions, create/edit/deactivate confirmation, empty/error/loading states, and logout. Test both apps at about 390, 768, 1024, and 1440 pixels, in system-light, system-dark, manual light, and manual dark. The admin/login routes must be noindex; local public robots disallows all while `SITE_INDEXING_ENABLED=false`.

## Phase 7 rental cart verification

Prepare the real local database:

```powershell
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm catalogue:seed
```

Success means migration `20260723170000_rental_cart_foundation` is applied and
Prisma reports no pending migrations.

Run the complete automated gate:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Unit and integration success includes strict quantity validation, fixed BFF
paths, foreign-Origin and non-JSON rejection, HttpOnly cookie handling, exact
response allowlists, guest-token isolation, expiry, inactive catalogue items,
idempotent absolute updates, database constraints, remove/clear, and the real
PostgreSQL non-reservation proof. That proof creates inventory with capacity 2,
saves desired quantity 100, and confirms Inventory, InventoryItem, and
InventoryTransaction remain unchanged.

The Playwright gate adds `/cart` reflow and serious/critical axe checks at 320,
390, 768, 1024, 1440, and 1920 pixels. The desktop workflow adds a real product,
saves quantity 100, checks the distinct-line badge, reloads the page, and proves
customer-visible text contains no stock claim.

Manual browser test:

1. Start everything with `pnpm dev`.
2. Open `http://localhost:3000/rentals` in a private browser window.
3. Open a product, set quantity 100, and add it to the cart.
4. Confirm the header badge says one equipment type and `/cart` shows 100.
5. Refresh and confirm the same cart remains.
6. Change quantity with keyboard and pointer controls.
7. Remove a line, then test cancel and confirm in the clear-cart dialog.
8. Confirm the empty state links back to the catalogue.
9. Repeat in light and dark modes and at narrow mobile width.
10. Confirm `/cart` is noindex, excluded from sitemap, and disallowed by
    production robots rules.
11. Search API JSON and rendered text for internal quantities, availability,
    stock, asset/serial identity, price, and reservation; none may appear.
12. Confirm no request form, customer login, quote, price, reservation, or
    checkout was introduced.

The cart's 1–1000 range is a technical abuse boundary, not an inventory limit.
Cart state never proves availability and never reserves equipment.

## Phase 8 rental request verification

Prepare PostgreSQL and the schema:

```powershell
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm catalogue:seed
```

Success means migration `20260724110000_rental_request_foundation` is current.
Run the quality gate:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Unit/integration success covers strict contact/date/delivery validation,
fixed-path and bounded BFF behavior, exact Origin/JSON enforcement, HttpOnly
capability handling, capability/global rate-limit separation (including clients
sharing one BFF address), idempotent cart conversion, immutable item snapshots,
private tracking, customer-safe DTO allowlists, inactive-cart preservation, and
a real PostgreSQL proof that desired quantity 100 succeeds against internal
capacity 2 while all inventory records/history remain unchanged.

Manual test:

1. Start all apps with `pnpm dev`.
2. Add an active product at `/rentals` and continue from `/cart`.
3. Confirm invalid/reversed dates and delivery without an address are blocked.
4. Review desired quantities; submit once, then verify the readable reference.
5. Refresh status in the same browser; use `/track-request` with the reference.
6. Try the reference in a private browser and expect the generic unavailable
   state.
7. Confirm the cart cleared only after success and a failed submission retains
   it.
8. Check light/dark modes and mobile/desktop widths.
9. Confirm request pages are noindex, absent from sitemap, and disallowed by the
   production robots rules.
10. Search public JSON/HTML for contact data, notes, capability tokens, staff,
    price, inventory, availability, stock, approved quantity, and reservation;
    none should appear in tracking responses.

The request remains `SUBMITTED`. Staff queues, availability, assignment,
approval, partial approval, rejection, quotes, reservations, customer accounts,
email notifications, and orders are deliberately not part of Phase 8.

## Phase 8.1 hardening and regression verification

Ensure the ignored `.env` includes the current `TEST_DATABASE_URL` and cart
rate-limit values from `.env.example`. Open Docker Desktop, then apply the
cleanup migration to the normal development database:

```powershell
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:verify
```

Preview cleanup first, then run it twice to verify idempotent local behavior:

```powershell
pnpm cleanup:expired:dry-run
pnpm cleanup:expired
pnpm cleanup:expired
```

Success prints bounded counts without identifiers or secrets. The second run
normally reports zero unless new rows expire between runs. Automated tests prove
active sessions/carts survive, request and item history survives guest-session
detachment, inventory history remains append-only, and dry-run changes nothing.

Run the complete code gate:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` starts and resets only the guarded local `_test` database. Success
includes the test-database URL guard, cart read/mutation limiter, capability
isolation, safe 429 responses, recursive public confidentiality, cleanup,
request rollback/idempotency, and all earlier regression suites. Run it twice;
both runs must pass without changing normal development inventory/request
counts. Append-only and immutable triggers must remain enabled.

Prepare browser data and run every disjoint group:

```powershell
pnpm catalogue:seed
```

Keep the applications running in another PowerShell window:

```powershell
pnpm dev
```

Then run:

```powershell
pnpm test:e2e:smoke
pnpm test:e2e:catalogue
pnpm test:e2e:cart
pnpm test:e2e:requests
pnpm test:e2e:admin
```

Successful smoke output proves web, admin, API, and database readiness. The
catalogue group covers responsive filtering, media confidentiality, theme, and
accessibility. Cart covers persistence and quantity 100 without availability
or reservation claims. Requests cover atomic submission and private tracking.
Admin covers unauthenticated protection and light/dark accessibility. The
complete equivalent command is `pnpm test:e2e`; it executes each test once and
does not conceal failures with retries.

Common failures:

- Test runner refuses the URL: add the distinct local `TEST_DATABASE_URL` from
  `.env.example`; never weaken the `_test`/localhost guard.
- Test PostgreSQL is unavailable: open Docker Desktop and rerun `pnpm test`.
- Browser readiness times out: keep `pnpm dev` running; ensure ports 3000,
  3001, 4000, and the configured `POSTGRES_PORT` are free; apply migrations;
  and run `pnpm catalogue:seed`.
- A cart operation returns 429: wait for the configured local window. The
  response intentionally reveals no capability, inventory, or counter detail.

Phase 8.1 does not implement staff request review, decisions, quotes, orders,
reservations, operations, customer accounts, mobile applications, or
production deployment.

## Phase 9 administrative rental-request review verification

Open Docker Desktop. In PowerShell at the repository root, prepare the normal
development database and authorization catalogue:

```powershell
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
```

Success means PostgreSQL is healthy, Prisma validation/generation finish
without errors, migrations `20260727150000_admin_rental_request_review` and
`20260727150100_admin_rental_request_review_constraints` are applied, no
migration is pending, and RBAC verification succeeds. These
commands do not prove the feature by themselves.

Run the complete automated code gate:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Each command must exit with code 0. The tests should cover 401 versus 403,
default role behavior, permission-gated quantity context, queue pagination,
search/filter/sort, immutable item snapshots, public confidentiality,
assignment/reassignment/unassignment and history, disabled-assignee rejection,
stale-version conflicts, append-only validated notes, the sole
`SUBMITTED -> UNDER_REVIEW` transition, and non-reservation/non-mutation
regressions. Do not report the gate as passing unless all commands actually
finish successfully.

### Manual API and browser checks

First submit at least one guest request through the public site as described in
[Local development](local-development.md), then keep the stack running:

```powershell
pnpm dev
```

In a second PowerShell window, verify service readiness:

```powershell
(Invoke-WebRequest http://localhost:3000).StatusCode
(Invoke-WebRequest http://localhost:3001/login).StatusCode
(Invoke-RestMethod http://localhost:4000/health).status
(Invoke-RestMethod http://localhost:4000/health/database).database
```

The websites should return 200, and the health responses should report a
running API and reachable database without revealing credentials.

Use the browser for cookie-authenticated review testing:

1. Log in at `http://localhost:3001/login` with credentials sourced from your
   ignored `.env`—never paste the password into documentation or test output.
2. Open `/rental-requests`; verify reference/customer search, each filter,
   each sort, pagination, loading, empty, and error behavior.
3. Verify an unauthenticated browser redirects/blocks the queue (API equivalent
   is 401) and an authenticated `EDITOR` is denied (API equivalent is 403).
4. Open a detail and compare its requested quantities/snapshots with the guest
   submission. Catalogue edits must not alter those snapshots.
5. Assign, reassign, and unassign an eligible active staff member. Confirm each
   action is retained in activity history and a disabled user is rejected.
6. Open the same detail twice. Change assignment in one tab and submit a stale
   change from the other; the stale write must be rejected, not overwrite.
7. Add one valid note. Try blank and overlong notes and expect validation
   errors. Refresh and verify author/time retention without an edit/delete UI.
8. Start review. Confirm `SUBMITTED` becomes `UNDER_REVIEW`; retrying or an
   invalid transition must be idempotent or safely rejected.
9. Confirm no approved quantity, approve/partial/reject action, quote, price,
   order, reservation, inventory mutation, or inventory transaction appears.
10. With full inventory permissions, verify current totals and the visible
    date-conflict limitation. With `rental_request.view` but without either
    inventory permission, verify the detail still loads and contains no totals.
11. Open customer tracking in the capability-owning browser and recursively
    inspect its JSON/rendered output. It must contain no staff/assignee IDs,
    internal notes/activity, inventory, conflicts, permissions, capabilities,
    session data, or internal comments.
12. Log out, refresh both admin routes, and confirm access is not restored.

Repeat queue/detail checks in light and dark themes and at widths 320, 390,
768, 1024, 1440, and 1920 pixels. At 320 pixels, content may use an intentional
local table scroller but the page itself must not overflow horizontally. Tab
through search, filters, pagination, assignment, note form, and start-review;
labels, focus indicators, error announcements, and status meaning must remain
usable without a mouse or color alone.

Run the relevant browser partition(s) after the Phase 9 Playwright checks are
present, keeping `pnpm dev` running:

```powershell
pnpm test:e2e:smoke
pnpm test:e2e:admin-requests
```

The Phase 9 partition signs in using the ignored `.env`, exercises queue search,
detail, assignment, a synthetic internal note, and start-review, then checks
dark-mode 320-pixel reflow and serious/critical accessibility findings. It
requires at least one `SUBMITTED` request and intentionally changes that local
request to `UNDER_REVIEW`. Success requires every selected Playwright test to
pass without concealing a failure. Use `pnpm test:e2e:admin` for all admin-tagged
checks, or the full `pnpm test:e2e` command when validating all earlier public
catalogue, cart, request, and admin regressions.

Common failures include an unapplied Phase 9 migration, no submitted fixture,
an expired staff session, missing role permissions, a disabled assignee, stale
`reviewVersion`, or unavailable Docker/API. A missing inventory panel is not a
failure when the user lacks quantity permissions. Current counts must never be
described as available for the requested dates.

## Phase 10 approval-decision tests

Run the authoritative test workflow from PowerShell. It starts and safely
resets only the isolated database whose name ends in `_test`, applies every
migration, then runs all package and API tests:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Success means every command exits with code 0. Decision coverage includes full,
partial, and rejected quantity shapes; original-quantity immutability; exact
permission enforcement; inactive-user rejection; stale-version conflicts;
idempotent replay; append-only database triggers; customer-safe projection;
and proof that inventory transactions do not change.

Stop normal applications on ports 3000, 3001, and 4000, then run:

```powershell
pnpm test:e2e:admin-decisions
```

The focused runner refuses an already-running application, validates that
`TEST_DATABASE_URL` is local, differs from `DATABASE_URL`, and ends in `_test`,
then resets only that isolated database. It creates temporary staff,
catalogue, and guest-request fixtures and verifies approval, partial approval,
rejection, customer-safe tracking, terminal controls, responsive behavior, and
serious/critical axe findings. It never chooses an unrelated development
request. Run one outcome with `pnpm test:e2e:admin-decisions:approve`,
`:partial`, or `:reject`. Common failures are Docker Desktop not running,
missing safe `.env` database URLs, Chromium not installed, or occupied ports.

## Phase 11 quote tests

Run the complete non-browser gate from the repository root:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Success means Prisma validates/generates, all migrations are applied, RBAC verifies, formatting/lint/typecheck have zero errors, unit/integration tests pass against the isolated `_test` database, and all three production builds complete.

Quote tests cover strict DTOs and BFF allowlists, body-size and malformed-JSON handling, decimal-string parsing, integer-cent/basis-point totals and half-up rounding, permission independence, decision eligibility, quantity bounds, direct database immutability attempts, exact retry/conflicting operation behavior, hash-only capabilities, customer confidentiality, and absence of order/reservation/inventory mutations. PostgreSQL integration coverage includes concurrent first-quote and revision writers, simultaneous accept/reject, explicit rejection, expiry persistence, replacement supersession, capability revocation, disabled users, live permission revocation, and complete bulk/serialized inventory snapshots across create, revise, send, view, and respond. Existing Phase 9/10, cart, auth, RBAC, catalogue, media, and inventory suites remain part of `pnpm test`. Sustained concurrency/load testing remains production-readiness work.

Run focused browser workflows separately with normal dev servers stopped:

```powershell
pnpm test:e2e:admin-quotes
pnpm test:e2e:customer-quotes
pnpm test:e2e:quotes
```

The admin-focused coverage creates, validates, prices, double-submits safely, adds a charge and tax, verifies the exact total, sends, checks non-reservation wording, exercises dark mode and 320px overflow, and runs axe. The customer coverage exchanges a fragment capability, checks private content, accepts, refreshes terminal state, verifies 320px overflow, and runs axe. The combined command additionally creates an immutable replacement revision, checks history, proves old access is revoked, and rejects the replacement. Expiry is deterministic in PostgreSQL integration coverage rather than delayed in the browser suite. The runner refuses a non-local database, a name not ending `_test`, development/test URL equality, or occupied ports. Common failures are Docker Desktop closed, missing Playwright Chromium (`pnpm exec playwright install chromium`), stale applications using ports 3000/3001/4000, or unsafe/missing `.env` test URLs.

## Phase 12 confirmed-order tests

Run the database and complete non-browser gate:

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Success means the Phase 12 migration applies, no migration is pending, the
RBAC mappings remain idempotent, every code gate exits 0, and production builds
finish. Automated coverage verifies strict DTOs, 401/403/authorized behavior,
accepted-revision eligibility, explicit-only conversion, exact immutable
snapshots and bigint money, idempotency/concurrency, append-only constraints,
hash-only capability access, uniform unavailable responses, first-view
deduplication, public confidentiality, and unchanged inventory records.

Stop normal applications and run each guarded browser group:

```powershell
pnpm test:e2e:admin-orders
pnpm test:e2e:customer-orders
pnpm test:e2e:orders
```

Admin success creates its own request/decision/accepted quote, confirms the
order through the explicit dialog, verifies exact totals and source links,
checks `NOT_RESERVED`, and finds no prohibited operational controls. Customer
success exchanges the fragment, refreshes through the HttpOnly cookie, renders
only allowlisted snapshots, and rejects access without the capability. The
suites include dark theme, 320-pixel no-overflow, and serious/critical axe
checks. The combined command performs both flows after one isolated reset.

Do not call the feature verified if Docker, migration, unit/integration,
production build, or browser execution was skipped. Common browser failures are
occupied ports, unsafe `TEST_DATABASE_URL`, Docker Desktop closed, missing
Chromium, or a stale generated Prisma Client.

## Phase 12.1 workflow-hardening tests

Run the database and non-browser gate from PowerShell:

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Every command must exit with code 0. Successful automated coverage includes:

- exact permission-limited work-summary counts and a SUBMITTED-only badge;
- fixed and percentage discount bases, rounding, taxable allocation, bounds,
  migration compatibility, and exact order snapshot copying;
- in-place DRAFT editing, version conflicts, operation replay, atomic children,
  and immutable sent/terminal revisions;
- resend without a revision/lifecycle/response/expiry change;
- explicit capability generation, revoke, rotation, old-link invalidation, and
  resend for confirmed orders;
- staff/capability PDF authorization, attachment/no-store headers, exact CAD
  content, safe filenames, and confidential-sentinel exclusion;
- malformed/unknown/expired/revoked access uniformity and number-alone denial;
- unchanged inventory, inventory transactions, decisions, and reservation
  absence across edit/resend/PDF/access actions.

Stop normal servers, install Chromium once if required, then run:

```powershell
pnpm --filter @mensah-rentals/web exec playwright install chromium
pnpm test:e2e:phase12-1
```

The focused browser suite uses the guarded local `_test` database, one worker,
no retries, deterministic fixtures, and production-mode builds. Its layout test
checks 320-pixel theme/accessibility/reflow behavior and 2560-pixel sidebar x=0,
badge, and dashboard behavior. Desktop 1024-pixel quote/order workflows cover
percentage discounts (with fixed discounts retained in unit/integration tests),
DRAFT editing, resend, link rotation/revocation, quote/order PDF downloads,
number-alone denial, and axe checks. The broader existing browser suites retain
their documented multi-viewport and customer-flow coverage.

Manual success means the badge follows its actionable definition, dashboard
values match seeded source records, PDF totals match the HTML snapshots, old
links fail after revoke/rotation, new links work, and no inventory or
reservation state changes. A PDF is not verified merely because a file
downloads: open it and inspect document number, revision where applicable,
dates, item/charge lines, discount, tax, total, terms, status, and notices.

## Phase 16 returns and reconciliation

Run the complete gates from PowerShell:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:admin-returns
pnpm test:e2e:return-issues
pnpm test:e2e:return-concurrency
pnpm test:e2e:returns
```

Success means the empty guarded test database applies all 41 migrations; RBAC reports 4 system roles and 73 permissions; static gates and all tests exit 0. Browser fixtures must be test-owned and isolated by workflow. They must cover partial/full bulk intake, condition splits, exact serialized occurrence return, duplicate/concurrent attempts, missing recovery, issue resolution without accidental inventory movement, explicit reconciliation/completion, dark persistence, 320 px, keyboard/focus, Axe serious/critical checks, PDF content, customer-capability status, and recursive confidentiality. Inventory totals before and after must match, while state buckets and ledger rows move exactly once. Never point `TEST_DATABASE_URL` at development, staging, or production.

## Phase 16.2 category correction

From the repository root, run `docker compose up -d postgres-test`, then `pnpm db:validate`, `pnpm db:generate`, `pnpm test`, `pnpm test:e2e:categories`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

The focused browser command resets only the allowlisted test database, creates test-owned empty and historically referenced categories, builds/starts the three applications, and stops them afterward. Success covers slug editing/normalization, empty hard deletion, non-empty cancel/confirm behavior, focus restoration, 320px dark persistence, serious/critical Axe checks, public removal, and preserved request history. API/database tests cover 401/403/422/409 behavior, duplicate slugs, server-side recounting, hard deletion, tombstones, post-commit media cleanup dispatch, and immutable request retention.

## Phase 16.3 product correction

From the repository root, start the guarded database and run `pnpm db:validate`, `pnpm db:generate`, `pnpm test`, `pnpm test:e2e:products`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. The focused browser runner resets only the allowlisted `_test` database and owns every product, request, staff account, and category it creates.

Success means product name/slug/category edits work without raw validation errors; duplicate and invalid slugs are friendly; an unreferenced product is hard-deleted only after confirmation; a referenced product becomes a tombstone while request history stays readable; the default EDITOR sees Edit/Deactivate but not Delete; public details return 404; dark mode persists at 320 px; the dialog restores focus and has zero serious/critical Axe findings. Service regressions additionally prove media/inventory links survive edits, empty inventory cleanup is bounded, serialized/history dependencies force retention, cart lines are removed, and no inventory mutation occurs.

## Phase 18 focused commands

Run `pnpm test:operator-tooling`, `pnpm db:integrity`, `pnpm db:integrity:test`, `pnpm db:backup:test`, `pnpm db:restore:test`, and `pnpm test:e2e:reports-all`. The focused browser commands are also available individually as `pnpm test:e2e:reports`, `pnpm test:e2e:audit`, and `pnpm test:e2e:system-status`. Success means guarded integrity is read-only, restore says `PASSED` with cleanup, and 320px/1440px report, export, audit, status, dark-theme persistence, overflow, and serious/critical Axe checks pass.

### Phase 18 manual checks

1. Run `pnpm dev`, sign in as the environment-bootstrap SUPER_ADMIN at `http://localhost:3001/login`, and open `/reports`. Success: period cards and request-volume chart load in Africa/Accra without an error alert.
2. Open every report navigation item. Exercise search, status/record-type/overdue/tracking/action/priority, and custom dates. Success: the URL retains filters, the backend page changes, invalid dates show a safe validation error, and no whole-table client filtering occurs.
3. Export a filtered report. Success: one `.csv` downloads with a fixed `mensah-rentals-...csv` name, formatted values, no secret/internal columns, and a corresponding read-only event appears in `/reports/audit`.
4. Open audit history, filter domain/action, open a detail, and export. Success: no edit/delete control exists and raw metadata, notes, credentials, operations, and payloads are absent.
5. Open `/system/status`. Success: readiness/migration values appear; no URL, host, path, key, token, or operator action appears. Backup verification is clearly guarded-test verification rather than an operational production backup.
6. Resize to 320px and 1440px, switch dark mode, reload, use keyboard Tab/Enter, and zoom to 200%. Success: preference persists, focus is visible, no page-level horizontal overflow occurs, and content remains readable.

### Exact automated sequence

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:reports
pnpm test:e2e:audit
pnpm test:e2e:system-status
pnpm test:e2e:reports-all
pnpm db:integrity
pnpm db:integrity:test
pnpm db:restore:test
git diff --check
```

The browser harness refuses occupied ports and resets only the local database whose name ends `_test`. A permission failure should be 401 without a session and 403 with an insufficient staff session. A row/range limit should be 422. A stale/unavailable dependency should show a safe error, never a stack or raw database message. Do not run browser/integration reset commands against staging or production.

## Local runtime/provider regression checks

Run `pnpm test:dev-readiness` to verify that the local readiness helper waits
through temporary failures and reports a clear timeout. Run
`pnpm --filter @mensah-rentals/admin test` for the application-level React
Query provider and Change Requests loading, error, empty, and data states. The
full verification remains `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, and `pnpm build`.

For a manual startup check, stop the three applications and run
`pnpm dev:safe`. Success means API health becomes ready before ports 3000 and
3001 start, and the final readiness message confirms the customer catalogue,
cart BFF, and Admin login. Run `pnpm test:dev-build-artifacts` to verify the
bounded stale-build cleanup and occupied-port protection. Sign in at
`http://localhost:3001/login`, then open
`/change-requests` and an available detail. The list must not show a missing
QueryClient error. Also check `/`, `/rental-requests`, `/quotes`, `/orders`,
`/maintenance/work-orders`, and `/reports` at 320px and 1440px. Verify dark
theme persistence, no page-level horizontal overflow, and zero serious or
critical Axe findings on Change Requests.

## Public navigation and cart-route regression

Stop normal local servers, open Docker Desktop, and run from the repository
root:

```powershell
docker compose up -d postgres-test
pnpm test:e2e:public-navigation
```

The guarded harness resets only `mensah_rentals_test`, builds the applications,
and runs Chromium at 320px and 1440px. Success means real homepage, Header,
Footer, catalogue, category, product, cart, rental-request, tracking, Privacy,
and Terms navigation stays out of the custom 404. It also proves cart load,
add, quantity update, remove, and clear operations use the local `/api/cart`
BFF; a desired quantity of 100 is accepted without stock claims; dark theme
persists; pages do not overflow; and Axe reports no serious or critical
violations. The deliberate `/this-page-does-not-exist-123` request must still
return 404. The suite also checks Admin login and API health without resetting
the development database.

# Phase 18.1 official PDF tests

Run the focused guarded browser workflow only after stopping normal local servers:

```powershell
docker compose up -d postgres-test
pnpm test:e2e:official-pdfs
```

Success means the 320px pickup and completed-return flows download safe `Mensah-Rentals-Order-...pdf` and `Mensah-Rentals-Return-...pdf` files through staff and customer capability paths. API tests also verify lifecycle gating, exact controlled legal content, inclusive duration, continuation pages, safe metadata, and absence of price labels, currencies, sentinel amounts, serial identifiers, and internal fields.

## Phase 18.5 feature-control testing

First start Docker Desktop, then run:

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Successful database output reports 53 migrations and an up-to-date schema. RBAC verification reports four roles and 97 permissions. Static, test, and build commands must exit with code 0.

Focused browser coverage:

```powershell
pnpm test:e2e:feature-settings
```

The suite verifies Website Only, catalogue preservation, hidden operational entry points, atomic dependency activation, a real maintenance live-work blocker, Testing badges, top-right success/error toasts, dark-mode persistence, 320px containment, and zero serious/critical Axe findings. It restores Full Operations in its guarded test database.

Run the required regressions individually:

```powershell
pnpm test:e2e:homepage-all
pnpm test:e2e:public-navigation
pnpm test:e2e:inventory-management
pnpm test:e2e:admin-reservations
pnpm test:e2e:admin-fulfilment
pnpm test:e2e:returns
pnpm test:e2e:official-pdfs
pnpm test:e2e:customer-orders
pnpm test:e2e:seo
pnpm seo:audit
pnpm db:integrity
pnpm rbac:verify
```

Each browser command resets only the guarded `_test` database. Stop local app servers first. A failed transition must leave the previous states selected, stop the spinner, and show an error toast. Public responses should contain only safe booleans and never inventory quantities, feature reasons, versions, actor IDs, or dependency data.
