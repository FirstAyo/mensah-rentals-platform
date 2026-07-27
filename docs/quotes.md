# Custom Quotes

Phase 11 implements custom, staff-priced CAD quotes after an immutable rental-request decision. A quote is a commercial proposal. It is not a confirmed rental order, does not reserve inventory, does not calculate date availability, and does not mutate inventory.

## Eligibility and domain separation

Only `APPROVED` and `PARTIALLY_APPROVED` requests with an authoritative `RentalRequestDecision` are eligible. Each request has at most one `Quote` thread, containing immutable `QuoteRevision` snapshots. Future `RentalOrder` and `InventoryReservation` concepts remain separate and unimplemented.

Every positive approved decision line appears exactly once in a revision. Quoted quantity is positive and cannot exceed approved quantity. Zero-approved lines stay in decision history but cannot become billable. Product, category, rental-unit, approved-quantity, and pricing snapshots ensure catalogue edits never rewrite quote history.

## State machine and revisions

Commercial revision fields, items, charges, and tax are append-only at the database boundary. A separate lifecycle row allows:

```text
DRAFT -> SENT -> VIEWED -> ACCEPTED
              \          -> REJECTED
               \         -> EXPIRED
                \        -> SUPERSEDED
DRAFT ------------------> SUPERSEDED (corrected by a new draft revision)
```

`SENT` can also move directly to a terminal state. All terminal states are final. An accepted quote cannot be revised in Phase 11.

`Quote.latestRevisionId` identifies the newest staff revision. `Quote.customerRevisionId` identifies the customer-active or responded revision. Preparing a draft does not invalidate a sent revision. Sending a replacement atomically supersedes the old `SENT`/`VIEWED` revision and revokes its access. Only one revision is customer-actionable.

Unsaved form changes are not revisions. Saving creates an immutable draft snapshot. Correcting a saved draft creates a new immutable draft and supersedes the earlier draft. Revision numbers are allocated under a quote-row lock and are unique per quote. Canonical payload hashes and UUID operation identifiers make exact retries idempotent; conflicting reuse returns `409`.

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

Tax is rounded once at quote level using non-negative half-up rounding. A discount is a separate non-negative value, never a negative arbitrary charge. It cannot exceed the subtotal; a taxable discount cannot exceed taxable gross. The tax snapshot preserves name, rate, basis, and amount. Business owners must review tax applicability before production; the application makes no tax-law claim.

Each unit price, charge, or discount is bounded at 100,000,000 cents (CAD 1,000,000). Revision aggregates are bounded at 100,000,000,000,000 cents, below signed `BIGINT` overflow after rate multiplication and JavaScript's safe-integer ceiling for DTOs. A revision supports at most 100 items, 25 charges, quantities up to 1,000, and rates up to 10,000 basis points. Client totals are rejected.

Allowlisted additive charge types are `DELIVERY`, `PICKUP`, `SETUP`, `TEARDOWN`, `LABOUR`, and `OTHER`. Every charge has a bounded customer label, amount, taxable flag, and deterministic order.

## Permissions and administrative API

- `GET /admin/quotes` — `quote.view`, with server pagination/search/filter/sort.
- `GET /admin/quotes/:id` — `quote.view`.
- `GET /admin/quotes/:id/revisions` — `quote.view`.
- `GET /admin/quotes/:id/revisions/:revisionId` — `quote.view`.
- `POST /admin/rental-requests/:id/quotes` — `rental_request.view` and `quote.create`.
- `POST /admin/quotes/:id/revisions` — `quote.view` and `quote.update`.
- `POST /admin/quotes/:id/revisions/:revisionId/send` — `quote.view` and `quote.send`.

The request guard and every mutation transaction resolve the current ACTIVE user and live permissions. Current seeded mappings give `SUPER_ADMIN` every permission, `ADMIN` all quote permissions, `SALES_PERSON` view/create/update/send, and `EDITOR` none. `quote.approve` remains intentionally unused; Phase 11 does not invent a managerial approval gate merely because that key exists.

Admin routes are `/quotes`, `/quotes/{quote-id}`, and `/rental-requests/{request-id}/quote`. The UI separates customer content and internal notes, displays immutable history, supports light/dark and narrow layouts, prevents duplicate submission, confirms sending, and states that no order or reservation is created.

## Sending and customer capability

Sending requires the latest `DRAFT`, matching lifecycle version, and `quote.send`. It records sender/time/activity and creates revision-scoped access. Exact retries regenerate the same capability from a random access UUID plus HMAC; only its SHA-256 hash is stored.

The generated link is `WEB_ORIGIN/quote/access#capability=...`. Fragments are not sent in HTTP requests or referrers. The access page immediately removes the fragment and submits it to a fixed same-origin BFF. The BFF validates it and sets a separate HttpOnly, host-only, SameSite=Lax cookie. Local HTTP uses Secure=false; production requires Secure=true and a `__Host-` cookie name. Access expires no later than `validUntil` or the configured TTL. Replacement sends revoke old access.

Raw capabilities appear only in an authorized send/replay response. They are never stored, logged, returned by list/detail, or placed in analytics. External email is deferred; staff copy the link through an approved private channel during local testing.

## Customer APIs and response

Private API routes are `POST /public/quotes/access`, `GET /public/quotes/current`, `POST /public/quotes/current/view`, and `POST /public/quotes/current/respond`. The web BFF mirrors only `/api/quote/access`, `/api/quote`, `/api/quote/view`, and `/api/quote/respond`.

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

Transactional email, distributed public rate limiting for multiple API instances, business-approved tax configuration, order conversion, reservations, date availability, inventory mutation, payments, and customer accounts are deferred. Redis remains unjustified for this local/single-VPS foundation.
