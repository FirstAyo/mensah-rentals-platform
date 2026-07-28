# Custom Quotes

## Request amendment effects

An amendment atomically changes the current `DRAFT`, `SENT`, or `VIEWED` proposal to `SUPERSEDED`, revokes customer access, and prevents sending or acceptance. Content and lifecycle history remain. A replacement quote requires a new decision for the current request revision. Ordinary amendment is blocked once a quote is accepted; the customer submits a formal change request and the accepted quote remains unchanged.

Phase 11 implements custom, staff-priced CAD quotes after an immutable rental-request decision. A quote is a commercial proposal. It is not a confirmed rental order, does not reserve inventory, does not calculate date availability, and does not mutate inventory.

## Eligibility and domain separation

Only `APPROVED` and `PARTIALLY_APPROVED` requests with an authoritative
`RentalRequestDecision` are eligible. Each request has at most one `Quote`
thread. A `QuoteRevision` is editable only while it is the latest unsent DRAFT
and becomes immutable when sent. `RentalOrder` and future
`InventoryReservation` remain separate concepts.

Every positive approved decision line appears exactly once in a revision. Quoted quantity is positive and cannot exceed approved quantity. Zero-approved lines stay in decision history but cannot become billable. Product, category, rental-unit, approved-quantity, and pricing snapshots ensure catalogue edits never rewrite quote history.

## State machine and revisions

Commercial content becomes append-only when sent. Before then, only the latest
`DRAFT` may be edited in place with optimistic concurrency, idempotent operation
identity, server recalculation, database validation, and append-only activity.
A separate lifecycle row allows:

```text
DRAFT -> SENT -> VIEWED -> ACCEPTED
              \          -> REJECTED
               \         -> EXPIRED
                \        -> SUPERSEDED
DRAFT ------------------> SUPERSEDED (corrected by a new draft revision)
```

`SENT` can also move directly to a terminal state. All terminal states are final. An accepted quote cannot be revised in Phase 11.

`Quote.latestRevisionId` identifies the newest staff revision. `Quote.customerRevisionId` identifies the customer-active or responded revision. Preparing a draft does not invalidate a sent revision. Sending a replacement atomically supersedes the old `SENT`/`VIEWED` revision and revokes its access. Only one revision is customer-actionable.

Unsaved form changes are not revisions. The first save creates revision 1 as an
editable unsent draft. Correcting it keeps the same revision ID and number and
increments its draft version. A new revision is created only after the preceding
customer-facing revision is immutable and the quote remains revisable. Revision
numbers are allocated under a quote-row lock and are unique per quote. Canonical
payload hashes and UUID operation identifiers make exact retries idempotent;
stale versions and conflicting reuse return `409`.

## Exact CAD money and tax

All authoritative amounts are integer Canadian cents. Tax rates are integer basis points (`5% = 500`). Calculations use `bigint`; PostgreSQL stores `BIGINT` and independently verifies totals at commit.

```text
line subtotal = quoted quantity * unit price cents
item subtotal = sum(line subtotals)
charge total = sum(additive charges)
subtotal = item subtotal + charge total
taxable gross = taxable lines + taxable charges
taxable subtotal = taxable gross - taxable discount (when configured)
tax = (taxable subtotal * rate basis points + 5,000) / 10,000
grand total = subtotal - discount + tax
```

Tax is rounded once at quote level using non-negative half-up rounding. A
discount is separate and non-negative. `FIXED_AMOUNT` preserves entered cents.
`PERCENTAGE` stores integer basis points and uses the complete item subtotal
plus additive charges as its pre-tax base. The calculated discount and its
proportional taxable reduction are rounded half-up once and snapshotted with the
type, rate, base, and totals. Business owners must review tax applicability
before production; the application makes no tax-law claim.

Each unit price, charge, or discount is bounded at 100,000,000 cents (CAD 1,000,000). Revision aggregates are bounded at 100,000,000,000,000 cents, below signed `BIGINT` overflow after rate multiplication and JavaScript's safe-integer ceiling for DTOs. A revision supports at most 100 items, 25 charges, quantities up to 1,000, and rates up to 10,000 basis points. Client totals are rejected.

Allowlisted additive charge types are `DELIVERY`, `PICKUP`, `SETUP`, `TEARDOWN`, `LABOUR`, and `OTHER`. Every charge has a bounded customer label, amount, taxable flag, and deterministic order.

## Permissions and administrative API

- `GET /admin/quotes` — `quote.view`, with server pagination/search/filter/sort.
- `GET /admin/quotes/:id` — `quote.view`.
- `GET /admin/quotes/:id/revisions` — `quote.view`.
- `GET /admin/quotes/:id/revisions/:revisionId` — `quote.view`.
- `POST /admin/rental-requests/:id/quotes` — `rental_request.view` and `quote.create`.
- `POST /admin/quotes/:id/revisions` — `quote.view` and `quote.update`.
- `PUT /admin/quotes/:id/revisions/:revisionId` — latest DRAFT only;
  `quote.view` and `quote.update`.
- `POST /admin/quotes/:id/revisions/:revisionId/send` — `quote.view` and `quote.send`.
- `POST /admin/quotes/:id/revisions/:revisionId/resend` — current valid
  SENT/VIEWED revision; `quote.view` and `quote.send`.
- `POST /admin/quotes/:id/revisions/:revisionId/access/rotate` — explicit
  capability replacement; `quote.view` and `quote.send`.
- `GET /admin/quotes/:id/revisions/:revisionId/pdf` — `quote.view`.

The request guard and every mutation transaction resolve the current ACTIVE user and live permissions. Current seeded mappings give `SUPER_ADMIN` every permission, `ADMIN` all quote permissions, `SALES_PERSON` view/create/update/send, and `EDITOR` none. `quote.approve` remains intentionally unused; Phase 11 does not invent a managerial approval gate merely because that key exists.

Admin routes are `/quotes`, `/quotes/{quote-id}`, and `/rental-requests/{request-id}/quote`. The UI separates customer content and internal notes, displays immutable history, supports light/dark and narrow layouts, prevents duplicate submission, confirms sending, and states that no order or reservation is created.

## Sending and customer capability

Sending requires the latest `DRAFT`, matching lifecycle version, and `quote.send`. It records sender/time/activity and creates revision-scoped access. Exact retries regenerate the same capability from a random access UUID plus HMAC; only its SHA-256 hash is stored.

The generated link is `WEB_ORIGIN/quote/access#capability=...`. Fragments are not sent in HTTP requests or referrers. The access page immediately removes the fragment and submits it to a fixed same-origin BFF. The BFF validates it and sets a separate HttpOnly, host-only, SameSite=Lax cookie. Local HTTP uses Secure=false; production requires Secure=true and a `__Host-` cookie name. Access expires no later than `validUntil` or the configured TTL. Replacement sends revoke old access.

Raw capabilities appear only in an authorized send, resend, or rotation
response. They are never stored, logged, returned by list/detail, placed in a
PDF, or placed in analytics. Resend reuses the current access and expiry without
changing revision, lifecycle, or customer response. Rotation explicitly revokes
the old access before appending a replacement. External email remains deferred;
the system prepares a secure test link and does not claim email delivery.

## Customer APIs and response

Private API routes are `POST /public/quotes/access`, `GET /public/quotes/current`,
`GET /public/quotes/current/pdf`, `POST /public/quotes/current/view`, and
`POST /public/quotes/current/respond`. The web BFF mirrors these through fixed
same-origin paths and never accepts a capability in a query string.

Mutations require exact Origin and JSON, bodies are bounded, responses are `private, no-store`, and private pages are `noindex`, `nofollow`, and `nocache`. Quote number alone grants no access. Missing, invalid, expired, revoked, mismatched, and superseded access produces the same unavailable response.

Customers may accept or reject the active, unexpired revision once. The transaction locks the quote and rechecks capability, pointer, state, and server time. Exact response retries are idempotent; conflicting responses return `409`. Acceptance records only quote acceptance. It creates no order, reservation, allocation, asset assignment, or inventory mutation.

Public DTOs explicitly allowlist quote/revision display values, customer display name, rental dates, item/price snapshots, charges, totals, customer notes, terms, validity, safe state, and the non-reservation notice. They exclude internal notes, staff identities, decision IDs/reasons, permissions, operations/hashes, access records, activity, inventory, reservations, and order internals. The web BFF recursively validates exact keys and fails closed on additions.

## Environment and local verification

New safe example values:

- `PUBLIC_QUOTE_ACCESS_SECRET` — at least 32 characters and unique in production.
- `PUBLIC_QUOTE_ACCESS_TTL_DAYS` — 1–90 days; final access expiry is capped by `validUntil`.
- `PUBLIC_QUOTE_COOKIE_NAME` — `mensah_quote_access` locally; production uses an appropriate `__Host-` name.
- `PUBLIC_QUOTE_COOKIE_SECURE` — false only on local HTTP; true in production.

Run:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Open `http://localhost:3001/rental-requests`, locate an approved request, choose **Create quote**, enter exact pricing, validity, tax, and notes, save, then send. Copy the private link into a separate browser context and accept or reject it. Confirm admin history updates and inventory does not.

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:admin-quotes
pnpm test:e2e:customer-quotes
pnpm test:e2e:quotes
```

The quote browser runner refuses occupied application ports, validates a distinct local `_test` database, resets only that database, seeds test-owned fixtures, uses one Playwright worker with zero retries, and stops child processes.

## Deferred work

Transactional email, distributed public rate limiting for multiple API instances, business-approved tax configuration, reservations, date availability, inventory mutation, payments, and customer accounts are deferred. Accepted-quote order conversion is implemented; Redis remains unjustified for this local/single-VPS foundation.

## Phase 12.1 PDF boundary

Staff with `quote.view`, or the customer holding that exact valid revision
capability, can download a private selectable-text PDF for a non-draft
customer-facing revision. The document uses snapshotted customer/project/date
and commercial fields. It includes document number/revision, dates, items,
charges, discount, tax, total, customer-visible notes/terms, status, and the
non-reservation notice. It excludes internal notes, staff, decisions, activity,
operations, access records or URLs, inventory, availability, and reservations.

## Phase 12 continuation

Acceptance still creates no order automatically. Staff with live
`order.create` may explicitly convert the authoritative accepted revision.
Once accepted, that customer revision cannot be replaced or revised. The order
copies and verifies exact accepted snapshots and stays `NOT_RESERVED`; see
[Confirmed rental orders](rental-orders.md). Reservations remain deferred.
