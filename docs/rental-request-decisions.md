# Rental Request Decisions

Phase 10 adds a final, auditable staff decision to a rental request. It does
not add pricing, quotes, orders, requested-date availability, inventory
reservations, or inventory mutations.

## State machine

The supported path is:

`SUBMITTED -> UNDER_REVIEW -> APPROVED | PARTIALLY_APPROVED | REJECTED`

A decision cannot be made directly from `SUBMITTED`. A terminal request cannot
receive a second decision. Assignment is frozen after a terminal decision;
append-only internal notes remain available for later context.

## Quantities and outcomes

`RentalRequestItem.requestedQuantity` remains the immutable customer request.
Every decision stores one `RentalRequestDecisionItem` for every request line,
including a requested-quantity snapshot and the separate approved quantity.

- Full approval copies every requested quantity into approved quantity.
- Partial approval requires the exact request-line set, each approved quantity
  from zero through the requested quantity, at least one changed line, and at
  least one positive line.
- Rejection records zero on every internal decision line. Customer tracking
  omits approved quantities for rejected requests.

Original requested quantities are never overwritten.

## Reasons and public visibility

Every decision requires an internal reason. Partial approval and rejection
also require a customer-safe explanation; approval may include one. Shared Zod
validation normalizes Unicode and whitespace, bounds the value to 2,000 plain
text characters, and rejects contextual internal-inventory, asset-condition,
and other-customer language. It deliberately allows harmless numbers such as
dates, times, request references, and event sizes. The UI tells staff what must
remain private. This validation is defense in depth: explicit public DTO
mapping is the confidentiality boundary. If unsafe legacy/directly inserted
text is encountered, public tracking substitutes a generic server-owned
message instead of returning it.

Administrative decision responses include the internal reason, safe staff
identity, line snapshots, approved quantities, and derived quote eligibility.
Customer tracking receives only outcome, decision time, customer-safe
explanation, a scope notice, and approved quantities for approved/partially
approved requests. It never receives internal reasons, staff identity,
inventory context, operation IDs, payload hashes, review versions, or quote
eligibility.

## Immutability, concurrency, and idempotency

`RentalRequestDecision` is unique by request and by client operation ID. The
API hashes a canonical decision payload and safely replays the same actor's
identical operation. Reusing the operation ID differently returns conflict.
The service rechecks the active user's current permissions inside the database
transaction, locks the request row, and verifies `expectedReviewVersion`.

PostgreSQL constraints and triggers enforce the terminal state/decision match,
exact line coverage, valid quantity shapes, allowed transitions, and append-only
decision records. The Phase 10.1 terminal-integrity migration also freezes the
terminal status, review version/timestamp, and assignment fields and requires
the terminal request version to match its decision. Decision revisions are
intentionally absent. A future phase
must define explicit supersession and audit semantics before revisions exist.

## Permissions and endpoints

All endpoints require an active staff session plus `rental_request.view`:

- `GET /admin/rental-requests/:id/decision`
- `GET /admin/rental-requests/:id/decisions`
- `POST /admin/rental-requests/:id/decisions/approve` also requires
  `rental_request.approve`.
- `POST /admin/rental-requests/:id/decisions/partially-approve` also requires
  `rental_request.partially_approve`.
- `POST /admin/rental-requests/:id/decisions/reject` also requires
  `rental_request.reject`.

The three decision permissions are independent. Frontend visibility is only a
usability aid; the NestJS guard and transaction-time permission lookup are the
authorization boundary.

## Quote eligibility and inventory boundary

Approval and partial approval derive `quoteEligible: true` for administrative
use; rejection derives false. This is a read-only signal. No quote entity is
created. Public tracking does not expose the flag.

Decision code never calls inventory mutation services. The Phase 10 decision
migrations add no quote, order, or reservation records; later phases keep those
as separate models and explicit transitions. Tests compare inventory
transaction counts before and after decisions. Current inventory context
remains advisory and is not requested-date availability.

## Local verification

From PowerShell at the repository root:

```powershell
docker compose up -d postgres postgres-test
pnpm install
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
pnpm dev
```

Sign in at `http://localhost:3001/login`, open Rental Requests, select a
submitted request, start review, enter the decision reason/explanation, set
partial quantities if applicable, and confirm. Customer-safe tracking remains
at `http://localhost:3000/track-request`.

The focused browser runner is destructive only to the guarded local `_test`
database. Stop normal servers on ports 3000, 3001, and 4000 first. It starts
`postgres-test`, resets only `TEST_DATABASE_URL`, seeds isolated fixtures,
starts all applications against that database, creates its own guest requests,
runs Playwright, and stops the applications:

```powershell
pnpm test:e2e:admin-decisions
pnpm test:e2e:admin-decisions:approve
pnpm test:e2e:admin-decisions:partial
pnpm test:e2e:admin-decisions:reject
```

## Quote continuation

Phase 11 consumes the immutable decision as quote source. It never changes requested or approved quantities. Positive approved lines must appear in each quote revision; zero-approved lines remain historical only. A quote customer response does not alter the decision or request status. See [Custom quotes](quotes.md).

## Confirmed-order continuation

Phase 12 can explicitly convert the quote's authoritative, timely accepted
revision into one immutable confirmed rental order. Conversion copies the
decision and accepted-quote snapshots; it does not update the original request
or decision quantities. Quote acceptance alone still creates no order, and
order creation still creates no reservation or inventory transaction. See
[Confirmed rental orders](rental-orders.md).
