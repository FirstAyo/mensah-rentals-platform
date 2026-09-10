# Phase 19.1 staging workflow corrections

Phase 19.1 responds to staging QA without changing the customer acceptance business rules. It adds operational discoverability and small workflow improvements while retaining the existing Request → Decision → Quote → Confirmed Order → Reservation → Fulfilment → Return lifecycle.

## Approved Orders and assignment

`/orders/approved` is an Admin workspace over authoritative `CONFIRMED` rental orders. It does not create a second order or a new status. Staff can search by order, quote, request, customer, company, or project and filter by assignment, reservation state, fulfilment state, method, and rental-start range.

Assignment is optional coordination metadata. An unassigned order remains processable whenever the staff member has the relevant RBAC permission. `Assign to me` is explicit; opening an order never assigns it. Updates use `assignmentVersion`, an operation ID, a payload hash, row locking, and a guarded update. Assignment, reassignment, and unassignment append order activity and platform-audit evidence. A stale writer receives HTTP 409.

The existing `order.view` and `order.update` permissions protect assignment. No new permission is introduced. Assignment never grants authorization and is never used instead of RBAC.

## Operational progression

The order projection derives a next action from authoritative states:

- no reservation or a failed/released reservation → create reservation;
- partial reservation with an unresolved shortfall → complete reservation;
- fully reserved, partially consumed, or partial reservation with an acknowledged shortfall plan and no fulfilment → start preparation;
- preparing → continue preparation;
- ready or partially checked out → checkout/handoff;
- checked out → active rental;
- active rental → return processing.

The order detail displays a compact state-derived progression through reservation, preparation, pickup/handoff, and return. It never marks later stages complete merely because reservation has started. Partial states remain explicit. Unavailable features and restricted actions are labelled rather than presented as executable next steps.

Automatic navigation occurs only after a successful backend mutation. Quote-to-order waits briefly and opens the confirmed order. A complete checkout waits briefly and opens the active rental. Existing manual links remain available. The UI stays in place when a mutation fails, a reservation is partial, more staff input is needed, the next feature is disabled, the user lacks permission, or no unambiguous next route exists.

## Internal default product price

`Product.defaultUnitPriceCents` is nullable integer CAD minor units with a database bound of 0 through 100,000,000 cents. Existing products remain valid with no default. Admin product create/edit forms accept a decimal CAD input and convert it to cents. Changes append platform-audit evidence containing the prior and new values.

The default is only a quote-entry convenience. A new quote line is initially populated from the current default when no saved draft value exists. Staff may override it. Quote revisions and confirmed orders keep their own immutable price snapshots; later product changes cannot rewrite them.

Public catalogue selectors and DTOs do not select or serialize the field. Customer pages and SEO structured data do not display or describe this internal price.

## Inventory adjustment semantics

The existing immutable inventory ledger remains authoritative. Staff never overwrite an aggregate total.

- Purchased/added stock appends an ownership addition.
- Damaged stock moves from `RENTABLE` to `DAMAGED`; rentable decreases and physical owned total does not.
- Maintenance uses its dedicated workflow.
- Sold, retired, disposed, or lost/written-off stock uses an ownership reduction and decreases physical total.
- Inventory correction requires a reason and records the correction as ledger history.

Existing service checks prevent negative state balances and ownership reductions that would invalidate live commitments. Operation IDs keep retries idempotent. Serialized assets remain individually controlled.

## Pickup and handoff

The existing checkout service remains the only state-changing handoff boundary. The accessible `Record pickup/handoff` dialog records recipient name, optional company, timestamp, acknowledgement reference, and internal notes. The authenticated actor is the confirmer. It consumes reservations once, moves internal inventory from rentable commitment to rented state without changing physical total, preserves serialized identities, creates or updates the active rental, and appends handoff history. Order detail renders that history with method, recipient, confirmer, time, item quantities, and partial/complete status. A persistent `Open active rental` link remains available if automatic navigation is interrupted. Partial checkout remains partial and does not redirect as a completed handoff.

## Dialogs and feedback

Primary quote, order-access, customer quote-response, return, issue-resolution, image-removal, and pickup confirmations use reusable accessible dialogs rather than browser alerts, confirms, or prompts. Dialogs support Escape, focus containment/restoration, pending controls, mobile containment, and both themes.

The Admin fetch instrumentation supplies top-right live-region toasts for mutations. Assignment has a specific success/error message. Copy actions report `Copied` only after clipboard success. Download links retain native browser download behavior; they do not claim completion before the response.

## Customer acceptance decision

**DEFERRED CLIENT DECISION: customer acceptance and customer price visibility.** Phase 19.1 does not remove acceptance, change its meaning, auto-confirm an order, change capabilities, or expand price display. The only customer-side acceptance change is replacing the browser-native confirmation with an accessible application dialog.

## Local verification

From the repository root in PowerShell:

```powershell
docker compose up -d postgres postgres-test
pnpm db:backup
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:integrity
pnpm rbac:verify
pnpm seo:audit
pnpm test:e2e:staging-workflow-corrections
```

Use only the guarded `_test` database for browser fixtures.

## Manual staging deployment checklist (do not run during implementation)

1. Confirm the local gates and independent QA passed and create the reviewed commit on `staging`.
2. On the VPS, back up the staging PostgreSQL database and verify its checksum.
3. Back up the persistent media volume and verify its checksum.
4. Record the current commit, container state, migration status, and health responses as the rollback checkpoint.
5. Fetch and fast-forward the staging checkout to the exact reviewed commit.
6. Validate `.env` without printing secrets; do not replace it from an example.
7. Build new images without deleting volumes or current images.
8. Run Prisma `migrate deploy` in the migration container. Never use reset or `db push`.
9. Start/recreate only the Mensah staging services on the existing shared proxy network.
10. Verify web, Admin, API, database health, migration status, Basic Auth, `X-Robots-Tag`, and `robots.txt`.
11. Smoke-test login, Approved Orders, assignment, product editing, reservation, handoff, public product links, and customer-safe surfaces.
12. If application checks fail, restore the prior images/commit. If a migration/data check fails, stop staging services and restore the verified database/media backups before restoring the prior application. Never change main-domain DNS.
