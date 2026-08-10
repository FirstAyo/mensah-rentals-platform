# Local Development on Windows

> For the reservation-shortfall workflow and guarded browser command, see [Reservation shortfall coverage](reservation-shortfall-coverage.md). Never reset the development database to test this workflow.

## Phase 17 maintenance setup and local workflow

Phase 17 uses the existing local PostgreSQL database and two additive migrations: `20260808090000_phase17_maintenance_inspections` and the corrective `20260808093000_phase17_maintenance_history_trigger_fix`. Never run `pnpm db:reset`, `prisma migrate reset`, `db push --force-reset`, or `docker compose down -v` against development. Open PowerShell in the repository root and run:

```powershell
docker compose up -d postgres postgres-test
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
```

The migrations bring the repository to 47 committed migrations. They add empty maintenance/inspection tables and correct the new history trigger without rewriting existing categories, products, inventory, rentals, returns, issues, or homepage data. The idempotent RBAC seed grants Phase 17 permissions to `SUPER_ADMIN` and `ADMIN` only.

Start the platform:

```powershell
pnpm dev
```

Sign in at `http://localhost:3001/login`, then open:

- `http://localhost:3001/maintenance/work-orders`
- `http://localhost:3001/maintenance/inspections`

To test preventive bulk maintenance, create a work order from currently rentable bulk inventory, assign active staff, start work, mark it ready, schedule/start/pass a post-maintenance inspection, then complete it with **Return to service**. The maintenance balance should increase once on creation and decrease once on completion; rentable should do the inverse and total physical quantity must remain constant.

To test a return-linked repair, first use the existing return flow to classify equipment as `DAMAGED` or `MAINTENANCE`. Create a work order from the return issue/action. The old return and issue must remain unchanged, an already-maintenance disposition must not move twice, and issue resolution must remain a separate explicit choice.

To test serialized equipment, choose the exact asset. A conflicting active work order for the same asset must fail. After successful inspection/completion, the same asset identity—not merely another unit of the product—must return to service.

Stop normal development servers before browser automation because the guarded harness owns ports 3000, 3001, and 4000. Run:

```powershell
pnpm test:e2e:maintenance
pnpm test:e2e:inspections
pnpm test:e2e:maintenance-all
```

These commands may reset only the distinct local database named by `TEST_DATABASE_URL`, whose name must end in `_test`. They must never point at development, staging, or production. Common errors:

- `403`: the active staff user lacks the exact maintenance/inspection permission.
- `409`: stale version, invalid lifecycle transition, conflicting active claim, or conflicting operation-ID reuse; refresh before retrying.
- `422`: impossible quantity/physical state, inactive assignee, invalid source, or reservation/preparation commitment conflict.
- Ports occupied: stop `pnpm dev` and retry.
- Docker unavailable: open Docker Desktop and wait for the engine before running Compose.

Maintenance and inspection times are stored in UTC. `WAITING_FOR_PARTS` is workflow state only; there is no parts catalogue or purchasing module.

## Phase 16.4.1 live Google Reviews setup

Phase 16.4.1 has no database migration and must not reset or reseed the development database. Open PowerShell in the repository root.

1. Confirm Docker Desktop is open, then start both databases:

   ```powershell
   docker compose up -d postgres postgres-test
   docker compose ps
   ```

   Both rows should show `healthy`.

2. Install dependencies and verify the existing schema:

   ```powershell
   pnpm install
   pnpm db:validate
   pnpm db:generate
   pnpm db:migrate
   pnpm db:status
   ```

   Do not run `pnpm db:reset`, `prisma migrate reset`, or `docker compose down -v` against manually maintained development data.

3. If `.env` does not exist, create it once:

   ```powershell
   Copy-Item .env.example .env
   ```

   If it already exists, edit it in place. Never replace it with `.env.example`.

4. In Google Cloud Console, enable Places API (New), enable billing when required, and create a dedicated server API key. Restrict the key to Places API (New) and restrict server use to the production VPS public IP/CIDR where practical. Monitor quota/billing and never reuse this key in a browser or mobile app.

5. Add the following to the ignored `.env` without sharing the actual values:

   ```text
   GOOGLE_REVIEWS_LIVE_ENABLED=false
   GOOGLE_PLACES_API_KEY=your-server-key
   GOOGLE_BUSINESS_PLACE_ID=your-verified-place-id
   GOOGLE_REVIEWS_URL=https://www.google.com/...
   GOOGLE_WRITE_REVIEW_URL=https://www.google.com/...
   GOOGLE_PLACES_LANGUAGE_CODE=en-CA
   GOOGLE_PLACES_REGION_CODE=CA
   GOOGLE_PLACES_TIMEOUT_MS=4000
   PUBLIC_GOOGLE_REVIEWS_RATE_LIMIT=120
   PUBLIC_GOOGLE_REVIEWS_RATE_WINDOW_SECONDS=60
   ```

6. Start the platform:

   ```powershell
   pnpm dev
   ```

7. Sign in at `http://localhost:3001/login`, open `http://localhost:3001/website/homepage`, find **Google Reviews connection**, and select **Test connection**. A successful safe result shows `LIVE`, the business name, rating/count presence, returned-review count, and attribution completeness. It never shows the key, Place ID, authors, or review text.

8. After a successful test, set `GOOGLE_REVIEWS_LIVE_ENABLED=true`, restart `pnpm dev`, and open `http://localhost:3000/`. If credentials are absent or Google is unavailable, the truthful Google-link fallback is expected.

The public policy pages are `http://localhost:3000/privacy` and `http://localhost:3000/terms`. They require owner/legal review before production. See [Live Google Reviews integration](google-reviews-integration.md).

## Phase 16.4A local homepage-media workflow

From PowerShell in the repository root, preserve a development database containing manual work before migration. Do not run `pnpm db:reset`; that command is only used by the guarded test harness.

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Open `http://localhost:3001/website/homepage`. Inside a hero or section image field, choose an existing homepage/product image or upload a new image and then explicitly select **Use this image**. Save with either action bar, preview the immutable draft, then publish. Category covers are managed on `http://localhost:3001/categories/{categoryId}/edit`; removing one falls back without deleting media. Verify the public result at `http://localhost:3000/`. Desktop navigation stays fixed; at narrow widths use **Menu**. Test light/dark themes, 320-pixel reflow, three-slide navigation, and category fallbacks.

Focused guarded browser commands are:

```powershell
pnpm test:e2e:homepage
pnpm test:e2e:homepage-admin
pnpm test:e2e:homepage-media
pnpm test:e2e:homepage-all
```

These commands reset only `mensah_rentals_test`, create test-owned catalogue/media fixtures under `storage/test-media`, build/start the apps, and stop them afterward. Stop any ordinary local dev servers first because the harness refuses to reuse occupied ports.

## Phase 16.4 homepage setup

From PowerShell in the repository root:

```powershell
docker compose up -d postgres postgres-test
pnpm install
Copy-Item .env.example .env -ErrorAction SilentlyContinue
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Do not replace an existing ignored `.env`; add only missing values. Google URLs are optional. Leave the API key and Place ID blank because live cards are disabled until a compliant integration is approved.

Open `http://localhost:3000/` for the public page and `http://localhost:3001/website/homepage` for the staff manager. Sign in with the local account created through `pnpm staff:bootstrap`, save a draft, preview it, and publish. Uploaded homepage files use ignored `storage/media/homepage`; product media remains under `storage/media/products`.

Before migrating a development database containing local work, create an ignored custom-format `pg_dump` and media manifest/backup. Never use `pnpm db:reset`, delete Docker volumes, or run test fixtures on that development database. Browser automation accepts only the guarded local `_test` database.

## Phase 15 first-time/update setup (Windows PowerShell)

From the repository root, close any older development terminals, open Docker Desktop, and run:

```powershell
docker compose up -d postgres postgres-test
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Successful migration output lists `20260730095900_phase15_fulfilment_enums` and `20260730100000_phase15_fulfilment_checkout`, or says no pending migrations. RBAC verification reports the seeded catalogue is valid.

Open `http://localhost:3001/login`, sign in with the local bootstrap account whose values come from your uncommitted `.env`, and open a confirmed reserved order at `/orders/{orderId}`. Start preparation, set prepared quantities no higher than reserved quantities, save, and mark ready. Confirm pickup/delivery and checkout. For a partial checkout, select the explicit partial option and provide an internal reason. Visit `/active-rentals` afterward.

The customer order link at `http://localhost:3000/order` may show only a coarse status, expected return date, and safe checked-out summary. It must not show reservation/preparation/shortfall counts or asset identifiers.

Stop applications with `Ctrl+C`; stop containers with:

```powershell
docker compose down
```

## Phase 18 operator checks

```powershell
docker compose up -d postgres postgres-test
pnpm db:migrate
pnpm rbac:seed
pnpm db:integrity
pnpm db:backup:test
pnpm db:restore:test
pnpm dev
```

Sign in at `http://localhost:3001/login`, then open `/reports`, `/reports/audit`, and `/system/status`. Restore verification must finish `PASSED` and clean its isolated database/media extraction. `.local-backups` is ignored; never commit its artifacts.

## Phase 16.2 category deletion and slug editing

Apply migration `20260731120000_phase16_2_category_deletion`, regenerate Prisma, and refresh authorization:

```powershell
docker compose up -d postgres postgres-test
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
```

Sign in at `http://localhost:3001/login`, then open **Categories**. **Deactivate** is reversible and requires category update authority. **Delete** is permanent catalogue removal and requires `category.delete`; non-empty categories show a stronger product-count warning. Run the isolated responsive workflow with `pnpm test:e2e:categories`. Changing a category slug changes its public URL; old URLs are not redirected.

## Phase 16.3 product deletion and slug editing

Apply migration `20260731130000_phase16_3_product_deletion`, regenerate Prisma, and refresh default roles with `pnpm db:migrate`, `pnpm db:generate`, `pnpm rbac:seed`, and `pnpm rbac:verify`. Sign in at `http://localhost:3001/login`, open **Products**, and use **Edit** to change the product name, slug, category, descriptions, rental unit, specifications, and featured state. Slugs are normalized to lowercase; changing one changes the public URL and the old URL does not redirect.

**Deactivate** is reversible and uses `product.update`. **Delete** requires `product.delete`; its confirmation explains whether the product can be hard-deleted or must be retained as a historical tombstone. Run `pnpm test:e2e:products` to exercise both paths against only the guarded test database.

## Phase 16 returns on Windows

After pulling the Phase 16 work, open PowerShell in the repository and run:

```powershell
docker compose up -d postgres postgres-test
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Migration `20260731100000_phase16_returns_reconciliation` introduces Phase 16 as migration 40. Hardening migration `20260731110000_phase16_return_hardening` is migration 41 and permits one immutable return ledger row per serialized asset while retaining one coalesced row per bulk destination bucket. The RBAC seed is idempotent and expands the catalogue from 63 to 73 permissions. Sign in at `http://localhost:3001/login`, prepare and check out a test order, open **Active Rentals**, select the rental, and use **Return intake**. Reconciliation queues are at `/returns` and `/issues`. Test bulk and serialized equipment separately. For a partial return, leave at least one checked-out unit untouched. For a full return, account for every unit, resolve blockers, click **Reconcile return**, then **Complete rental**. A partially checked-out order must have its remaining reservation quantity released before completion.

If intake returns `409`, reload: the expected return version or operation identity is stale. A `422` means the quantity, asset occurrence, lifecycle, physical resolution, or remaining reservation commitment is invalid. A `403` means the active staff user lacks one of the exact return permissions. Never reset the normal development database merely to run return tests; browser and integration harnesses must use the local guarded `_test` database.

Phase 15 deliberately has no return, damage, missing, maintenance-resolution, payment, or reconciliation controls.

## Phase 14 reservations on Windows

Stop running application processes, open Docker Desktop, then run from the
repository root:

```powershell
docker compose up -d postgres
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Open `http://localhost:3001/login`, sign in with the local staff account, open
Rental Orders, and choose a confirmed order. Its Reservation section shows
staff-only availability, explicit serialized selection, full/partial actions,
shortfall completion, release controls, and activity according to permissions.
No reservation controls or quantities appear on `http://localhost:3000`.

For isolated browser verification, first stop normal servers so ports 3000,
3001, and 4000 are free, then run:

```powershell
pnpm test:e2e:admin-reservations
pnpm test:e2e:reservation-concurrency
pnpm test:e2e:reservations
```

These commands reset only the guarded `_test` database. Never point
`TEST_DATABASE_URL` at development, staging, production, or a remote host.

## Phase 13 amendments on Windows

Run these commands from the repository root in PowerShell after copying `.env.example` to `.env` and starting Docker Desktop:

```powershell
docker compose up -d postgres
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

The Phase 13 migrations are `20260728210000_phase13_request_amendments`, `20260728211000_phase13_current_revision_trigger_fix`, and `20260728212000_phase13_decision_item_trigger_fix`. The final corrective migration also aligns the review-state constraint with `RE_REVIEW_REQUIRED`. `db:status` should report 25 migrations and say the database schema is up to date. The idempotent RBAC seed adds the amendment/change-request permissions to the intended system roles without replacing custom-role mappings.

Use `http://localhost:3000` for the customer site, `http://localhost:3001` for staff, and `http://localhost:4000` for the API. Submit a normal rental request first. Its tracking page establishes request-scoped private access in an HttpOnly cookie. Select **Amend this request**, change equipment and details, review the warning, and submit. Staff can then open **Rental Requests**, see the badge, compare revisions, start re-review, and create a new decision.

After an accepted quote or confirmed order, the tracking page offers **Submit a formal change request** instead. The original quote/order remains unchanged.

If the amendment page says access is unavailable, return to the private tracking page in the same browser profile. Do not paste capability cookies into terminals, screenshots, or tickets. If a stale `409` appears, reload the current revision and reapply the intended changes. Do not reset a shared/staging/production database; the guarded reset instructions elsewhere in this document are for disposable local development data only.

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

## 30. Run the Phase 12.1 hardening workflow

Use Windows PowerShell at the repository root. Open Docker Desktop first. This
phase adds no environment variable. Existing quote/order secrets and local
cookie settings from Phases 11 and 12 are still required in the ignored `.env`.

Prepare the schema and authorization catalogue:

```powershell
pnpm install
docker compose up -d postgres postgres-test
docker compose ps
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm staff:bootstrap
pnpm catalogue:seed
```

`db:status` must include both
`20260728140000_phase121_workflow_hardening` and
`20260728153000_phase121_quote_draft_integrity`, and report that the schema is
up to date. Start everything:

```powershell
pnpm dev
```

Sign in at `http://localhost:3001/login` using credentials stored only in your
ignored `.env`. Verify the dashboard and workflow:

1. At 1440px or wider, the sidebar begins at the browser's absolute left edge.
2. The Rental Requests badge counts `SUBMITTED` requests. Opening a request
   does not clear it; **Start review** removes it after the summary refresh.
3. Dashboard cards show only counts supported by your permissions. They never
   claim availability, rented, returns, missing/damaged, or reserved totals.
4. Create a fixed-discount quote. Create another test quote with a percentage
   discount and confirm the UI shows its basis-point percentage, pre-tax base,
   calculated discount, tax, and total.
5. Save a DRAFT, edit it, and confirm its revision number stays the same. Send
   it, then confirm commercial edit is blocked.
6. Use **Resend** on a valid SENT/VIEWED quote. Confirm history records a resend
   and no revision is added. Use **Rotate link** separately; the old link must
   become unavailable and the new link must work.
7. Download the quote PDF as staff and through the private customer link.
   Confirm totals and dates match and no internal notes or capability URL exist.
8. Accept a quote and create an order. Order creation should not automatically
   expose a customer link. On order detail choose **Generate link**, copy it,
   test **Resend**, **Revoke**, and **Rotate/Reissue**. Revoked links must fail.
9. Download the order PDF as staff and from the valid private order page.
10. Confirm every screen still says the order is `NOT_RESERVED` and none of
    these actions changes inventory or creates an inventory transaction.

The secure link shown by send/resend/generate/rotate is a local test delivery
artifact. External transactional email remains deferred, so the application
must not report that an email was delivered.

To check responsive layouts manually, use browser developer tools at widths
320, 768, 1440, 1920, and 2560 pixels. Test light and dark themes, keyboard
focus, dialogs, copied-link feedback, tables, and PDF controls. There must be no
document-level horizontal overflow.

Stop ordinary dev servers before the isolated focused browser command because
its runner owns ports 3000, 3001, and 4000:

```powershell
pnpm test:e2e:phase12-1
```

If Prisma Client generation reports a Windows DLL rename `EPERM`, stop every
running Mensah Rentals Node process (`Ctrl+C` in its PowerShell window), wait a
few seconds, and rerun `pnpm db:generate`. Do not delete `node_modules` or kill
unrelated Node applications merely to work around the lock.

## 29. Run the Phase 12 confirmed-rental-order flow

These commands are for Windows PowerShell at the repository root. Open Docker
Desktop first. If your ignored `.env` predates Phase 12, copy these values from
`.env.example` and replace the local secret with your own long development
value. Do not reuse it in production or commit `.env`:

```text
PUBLIC_ORDER_ACCESS_SECRET=choose-a-different-local-order-secret-at-least-32-characters
PUBLIC_ORDER_ACCESS_TTL_DAYS=90
PUBLIC_ORDER_COOKIE_NAME=mensah_order_access
PUBLIC_ORDER_COOKIE_SECURE=false
```

Apply and verify the migration and RBAC catalogue:

```powershell
docker compose up -d postgres
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm staff:bootstrap
pnpm catalogue:seed
```

`db:status` must include
`20260728090000_confirmed_rental_order_foundation` and report no pending
migration. Start everything:

```powershell
pnpm dev
```

Then complete this exact browser flow:

1. Sign in at `http://localhost:3001/login` using values stored only in `.env`.
2. Submit a guest request through `http://localhost:3000/rentals` and `/cart`.
3. Open it in admin, start review, and approve or partially approve it.
4. Create and send a quote; copy the private quote link.
5. Open that link in a separate/private browser and accept the quote.
6. Return to the accepted admin quote and choose **Create confirmed order**.
7. Review the accessible confirmation and confirm. It must state that inventory
   is not reserved.
8. Open the resulting `/orders/{id}` detail. Verify customer/project/date and
   exact accepted money snapshots, `CONFIRMED`, and **Inventory not reserved**.
9. Copy the private order link, open it in a private browser, and confirm the
   fragment disappears before `/order` loads.
10. Refresh `/order`; the dedicated HttpOnly cookie should retain access.
11. Open `/order` in another browser without that cookie and expect the generic
    unavailable state. An order number alone must not work.
12. Confirm neither page offers reserve, availability, asset, delivery, return,
    payment, or inventory controls.

Production requires HTTPS, `PUBLIC_ORDER_COOKIE_SECURE=true`, a cookie name
beginning `__Host-`, and a unique non-development secret different from quote
access. The order access expiry is independent from the old quote validity.

For isolated browser automation, stop normal dev servers first, install
Chromium once, and run:

```powershell
pnpm --filter @mensah-rentals/web exec playwright install chromium
pnpm test:e2e:admin-orders
pnpm test:e2e:customer-orders
pnpm test:e2e:orders
```

The runner owns ports 3000, 3001, and 4000 and resets only the guarded local
database whose name ends in `_test`. Common failures are occupied ports,
Docker Desktop being closed, missing Chromium, missing Phase 12 environment
values, an unaccepted/non-current quote revision, or insufficient
`order.create`/`order.view` permission. A `409` after another staff member
created the order is resolved by refreshing and following the existing order.

## Phase 11 custom quotes on Windows

Add these safe local values to the ignored `.env` file (never put a real production secret in `.env.example`):

```dotenv
PUBLIC_QUOTE_ACCESS_SECRET=replace-with-at-least-32-random-local-characters
PUBLIC_QUOTE_ACCESS_TTL_DAYS=30
PUBLIC_QUOTE_COOKIE_NAME=mensah_quote_access
PUBLIC_QUOTE_COOKIE_SECURE=false
```

With Docker Desktop open, apply and verify the quote migration:

```powershell
docker compose up -d postgres
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
```

`db:status` should report that the schema is up to date and include the Phase 11 migrations from `20260727210000_custom_quote_foundation` through `20260727214000_quote_lifecycle_updated_at_fix`. Start all applications:

```powershell
pnpm dev
```

1. Sign in at `http://localhost:3001/login` with credentials sourced from your ignored `STAFF_BOOTSTRAP_*` variables.
2. Open `http://localhost:3001/rental-requests` and use an APPROVED or PARTIALLY_APPROVED request. If needed, submit a guest request and complete Phase 9/10 review first.
3. Choose **Create quote**. Enter each CAD unit price, optional allowlisted charges, discount, tax name/rate, exact validity date/time, customer notes, terms, and separate internal notes.
4. Save the immutable draft. Open `http://localhost:3001/quotes`, locate it, and send it.
5. Copy the generated private link. Open it in a private/incognito window so the customer capability cookie is isolated from staff browsing.
6. Confirm `/quote/access` immediately becomes `/quote`, the fragment disappears, internal notes are absent, the no-order/no-reservation notice is visible, and accept/reject remains available only while valid/current.
7. Accept or reject, refresh, and confirm the response remains terminal. Return to admin quote detail to review history.

If access says unavailable, confirm the complete fragment link was copied, the quote is not expired/superseded, all three applications use the same `.env`, and cookies are enabled. On local HTTP keep `PUBLIC_QUOTE_COOKIE_SECURE=false`; production must use true and an appropriate `__Host-` cookie name. If creation returns `409`, refresh because another session changed the quote or the request already owns one. If `422`, correct the highlighted bounded money, quantity, tax, text, or validity value.

The browser suites are destructive only to the guarded local `_test` database. Stop normal dev servers first, then run `pnpm test:e2e:admin-quotes`, `pnpm test:e2e:customer-quotes`, or `pnpm test:e2e:quotes`. Never point `TEST_DATABASE_URL` at development, staging, or production.

## Phase 10 decision setup and manual check

From PowerShell at the repository root, apply the decision migrations and
confirm the existing permission catalogue:

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Open `http://localhost:3001/login` and sign in with the ignored `.env` bootstrap
credentials. Open `http://localhost:3001/rental-requests`, choose a submitted
request, and select **Start review**. Enter an internal reason. For partial
approval or rejection, also enter a customer-safe explanation; for partial
approval, set every approved quantity. Select the action, review the confirmation
dialog, and confirm. The terminal summary must retain both requested and
approved quantities. The customer tracking page is
`http://localhost:3000/track-request` and requires the original browser
capability.

If a `409` appears, the request changed after it was loaded. The form keeps its
entries; reload the request and verify the latest decision/version before
trying a new valid action. A `403` means the signed-in user lacks the exact
decision permission. Decision actions are available only from `UNDER_REVIEW`.

Do not add `-v` unless you intentionally want to erase local database data.

### Isolated Phase 10 decision browser tests

Close any normal `pnpm dev` process first. These commands intentionally reset
only the local database named by `TEST_DATABASE_URL`; the safety guard rejects
remote hosts, the normal development database, and database names that do not
end in `_test`:

```powershell
docker compose up -d postgres-test
pnpm test:e2e:admin-decisions
```

The complete command covers approval on desktop/light, partial approval at
320px/dark, and rejection on desktop/light. It creates every request it decides
through the guest workflow and retains the originating browser capability for
customer-tracking assertions. Focused commands are:

```powershell
pnpm test:e2e:admin-decisions:approve
pnpm test:e2e:admin-decisions:partial
pnpm test:e2e:admin-decisions:reject
```

The runner starts and stops the applications itself. It does not create quotes,
orders, reservations, inventory transactions, or serialized-asset assignments.

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

The Next.js servers optionally accept
`API_INTERNAL_URL=http://127.0.0.1:4000`; that is also their local default.
The browser-facing URLs remain on `localhost`. Using IPv4 explicitly for
server-to-server calls avoids a Windows startup failure when `localhost`
resolves to IPv6 (`::1`) before the API is listening there.
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

### Web or Admin starts before the API

Use the readiness-gated command from the repository root:

```powershell
pnpm dev:safe
```

It starts NestJS first, polls `http://127.0.0.1:4000/health`, and starts the
customer and admin Next.js applications only after the health check succeeds.
The default timeout is 120 seconds. To use a longer local compilation window:

```powershell
$env:DEV_API_READY_TIMEOUT_MS='180000'
pnpm dev:safe
```

An invalid health URL or timeout ends with a clear `API readiness timed out`
message instead of starting the frontend applications against an unavailable
API. `API_INTERNAL_URL` and `DEV_API_HEALTH_URL` remain configurable for other
environments; production process supervision must still report genuine API
outages rather than use this development orchestrator.

### next-themes script warning on Next.js 16.2

With Next.js 16.2.x and the latest stable `next-themes` 0.4.6, development may
log `Encountered a script tag while rendering React component`. Theme
initialization, system preference, manual light/dark selection, and persistence
continue to work. This is an open upstream compatibility warning. Do not patch
`node_modules`, suppress `console.error`, or replace the initialization script
with a template tag. Recheck the upstream package before a future dependency
update.

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

Successful migration status says the database schema is up to date. The seed reports `4 system roles` and `56 permissions`. Verification reports an idempotent seed.

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

Open `http://localhost:3001/login`, sign in with `STAFF_BOOTSTRAP_EMAIL` and `STAFF_BOOTSTRAP_PASSWORD`, and confirm the page shows `Super Admin`, `56 effective permissions`, and all development navigation placeholders.

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

The suite uses Chromium at 320, 390, 768, 1024, 1440, and 1920 pixels. Keep `pnpm dev` running in a separate PowerShell window first. Every browser command performs explicit readiness checks for the customer website, admin login, API, database connectivity, and seeded public catalogue before tests begin. On the first local checkout, the separate Playwright install command is required because browser binaries are not stored in Git.

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

## 27. Phase 8.1 hardening, cleanup, and isolated tests

If your ignored `.env` predates Phase 8.1, copy these safe local values from
`.env.example` without overwriting your existing staff credentials:

```text
TEST_POSTGRES_PORT=5434
TEST_DATABASE_URL=postgresql://mensah_test:mensah_test_password@localhost:5434/mensah_rentals_test?schema=public
PUBLIC_CART_READ_RATE_LIMIT=300
PUBLIC_CART_READ_RATE_WINDOW_SECONDS=60
PUBLIC_CART_MUTATION_RATE_LIMIT=120
PUBLIC_CART_MUTATION_RATE_WINDOW_SECONDS=60
PUBLIC_CART_GLOBAL_RATE_LIMIT=10000
PUBLIC_CART_GLOBAL_RATE_WINDOW_SECONDS=60
```

### Run database-backed tests safely

Keep Docker Desktop open, then run:

```powershell
pnpm test
```

The command starts the separate `postgres-test` Compose service on port 5434,
refuses unsafe or remote database URLs, resets only the database whose name ends
in `_test`, reapplies every migration/trigger, and runs the full test suite.
Your normal `mensah_rentals_dev` data on port 5432 is not used or deleted.
Repeated full test runs start from the same clean test schema and do not
accumulate append-only inventory fixtures in the development database.

To inspect both database containers:

```powershell
docker compose ps
```

Stop them without deleting either volume:

```powershell
docker compose down
```

Never point `TEST_DATABASE_URL` at development, staging, or production. The
runner intentionally rejects equal URLs, remote hosts, and names without the
`_test` suffix.

### Preview and run expired-access cleanup

First apply the Phase 8.1 migration:

```powershell
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm db:status
```

Preview the bounded cleanup without deleting anything:

```powershell
pnpm cleanup:expired:dry-run
```

Run the cleanup:

```powershell
pnpm cleanup:expired
```

Optional bounds can be passed to the package command:

```powershell
pnpm --filter @mensah-rentals/database cleanup:expired --dry-run --batch-size=100 --max-batches=5
```

The command removes only expired `StaffSession`, `Cart` (and its temporary
items), and `GuestRequestSession` rows. Active records remain. Removing an
expired guest session detaches tracking access but preserves `RentalRequest`
and immutable `RentalRequestItem` history. It never deletes products,
inventory, inventory transactions, or other durable business records. Running
it again is safe. A future VPS can invoke the same command from cron or a
systemd timer; overlapping workers use `SKIP LOCKED`, and horizontal scheduling
must still be operationally coordinated.

### Run partitioned browser tests

Prepare the development database and browser once:

```powershell
docker compose up -d postgres
pnpm db:migrate
pnpm catalogue:seed
pnpm --filter @mensah-rentals/web exec playwright install chromium
```

In a second PowerShell window, start the complete application stack and keep it
running:

```powershell
pnpm dev
```

Then run each group separately from the first PowerShell window:

```powershell
pnpm test:e2e:smoke
pnpm test:e2e:catalogue
pnpm test:e2e:cart
pnpm test:e2e:requests
pnpm test:e2e:admin
```

Or run the complete browser set once:

```powershell
pnpm test:e2e
```

Global setup waits for the customer website, admin login, API liveness,
database readiness, and at least one active seeded product. A readiness timeout
or failed group is a failure; do not report it as passing. Responsive checks
retain 320px coverage, and representative light/dark axe checks cover the
catalogue, cart, request, and admin login surfaces.

## 28. Run the Phase 9 administrative rental-request review

These steps are for Windows PowerShell. Start Docker Desktop first and wait
until it says the engine is running. Open PowerShell in the repository root;
the prompt should end with `mensah-rentals-platform`.

If this is your first setup, or dependencies changed, run:

```powershell
corepack enable
corepack prepare pnpm@10.15.1 --activate
pnpm install
```

If `.env` does not exist, create the ignored local file and fill in your own
`STAFF_BOOTSTRAP_*` values. Never put the password in `.env.example` or Git:

```powershell
Copy-Item .env.example .env
notepad .env
```

Start PostgreSQL, validate the schema, generate Prisma Client, and apply the
Phase 9 migration:

```powershell
docker compose up -d postgres
docker compose ps
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm staff:bootstrap
pnpm rbac:verify
pnpm catalogue:seed
```

`docker compose ps` should show `postgres` as healthy. `pnpm db:status` should
report that the database is up to date and include
`20260727150000_admin_rental_request_review` and
`20260727150100_admin_rental_request_review_constraints`. The second migration
adds status-dependent constraints after PostgreSQL commits the new enum value.
The RBAC commands are idempotent:
they preserve custom mappings while ensuring the local bootstrap user has its
documented `SUPER_ADMIN` role where appropriate.

Phase 9 needs at least one submitted request. If the queue is empty, start the
applications, open `http://localhost:3000/rentals`, add an active sample item,
continue through `/cart`, and submit a guest request. Desired quantities need
not match internal inventory and submission still creates no reservation.

Start all applications and keep this PowerShell window open:

```powershell
pnpm dev
```

Then:

1. Open `http://localhost:3001/login`.
2. Sign in with the email/password stored only in your ignored `.env` as
   `STAFF_BOOTSTRAP_EMAIL` and `STAFF_BOOTSTRAP_PASSWORD`.
3. Open `http://localhost:3001/rental-requests`.
4. Search by reference or customer contact, and test status, assignment,
   fulfillment, rental-date, sort, and pagination controls.
5. Open a request. Confirm its contact/project/date information and original
   requested quantities are present.
6. Assign an eligible active staff user, reassign if another eligible user is
   available, and unassign. Assignment never means approval.
7. Add a non-empty internal note. Confirm its author/time appear in the timeline
   and that refreshing does not remove it.
8. Select **Start review** on a `SUBMITTED` request. The only new internal state
   should be `UNDER_REVIEW`; no approve/reject controls belong to this phase.
9. If inventory context is visible, confirm the page says: “Current internal
   inventory context only. Date-based booking conflicts are not yet
   calculated.”
10. Log out and confirm the queue/detail can no longer be opened.

For the automated authenticated queue/detail check, keep `pnpm dev` running in
one PowerShell window and run this in a second window:

```powershell
pnpm test:e2e:admin-requests
```

This reads the bootstrap credentials only from the ignored root `.env`, needs
at least one `SUBMITTED` local request, adds a synthetic internal note, and
moves that test request to `UNDER_REVIEW`. It also checks dark mode, 320-pixel
reflow, and serious/critical accessibility findings.

To test concurrency, open the same request in two signed-in browser windows.
Change assignment in the first, then try a different assignment from the stale
second window. The second write should show a conflict instead of overwriting
the first. Refresh before retrying.

To test permissions, use an active local staff user with the intended role:

- `EDITOR` should receive no queue access.
- `SALES_PERSON` should have its mapped review actions but no decision actions.
- A custom role with `rental_request.view` and without the two inventory
  permissions should see the request but no internal quantities.

Role changes are made through the protected RBAC API/admin foundation; never
edit the database manually. Log out and back in if you want the UI to refresh
its permission-aware navigation, although the API resolves current permissions
on protected requests.

Check customer confidentiality in the original browser that submitted the
request. Open `http://localhost:3000/track-request`, enter the reference, and
confirm tracking contains no assigned staff, staff IDs, internal note,
activity, inventory count, review comment, permission, or conflict assessment.
A private browser without the guest capability should still get the generic
unavailable state.

Reviewing a request must not create an inventory transaction or reservation.
The current schema has no reservation model. If you inspect inventory in the
admin UI before and after Phase 9 actions, its quantities and history must be
unchanged.

Common Phase 9 problems:

- **401 Unauthorized:** the staff cookie is missing/expired; sign in again at
  `http://localhost:3001/login` and use `localhost`, not `127.0.0.1`.
- **403 Forbidden:** the signed-in user lacks the required review or inventory
  permission. Frontend visibility cannot override API authorization.
- **409 conflict/stale version:** another write advanced `reviewVersion`;
  refresh the detail and decide whether to retry.
- **Assignee rejected:** select an existing active staff user. Disabled users
  are intentionally ineligible.
- **No requests:** submit one through the guest customer workflow first.
- **No inventory counts:** this is expected without both `inventory.view` and
  `inventory.quantity.view`.
- **Prisma client/schema mismatch:** stop `pnpm dev`, then rerun
  `pnpm db:generate`, `pnpm db:migrate`, and `pnpm dev`.
- **Port already used:** stop the old process using ports 3000, 3001, or 4000,
  then restart `pnpm dev`.

Press `Ctrl+C` in the development window to stop the applications. To stop
Docker without deleting the local database volume, run:

```powershell
docker compose down
```

# Testing official customer PDFs locally

1. Start PostgreSQL and the applications as documented above.
2. Complete an order's first checkout/pickup in Admin. The order detail and private customer page then allow the official Order Form download.
3. Record all return intake, reconcile it, and complete the rental. The return detail and private customer page then allow the official Return Form download.
4. A form requested before its authoritative lifecycle event is intentionally unavailable.
5. Run `pnpm test:e2e:official-pdfs` with normal development servers stopped. This command resets only the guarded `_test` database, never the development database.
