# Confirmed Rental Orders

## Phase 15 fulfilment

The immutable order snapshot supplies method, quantities, customer/project details, dates, and destination. Preparation and checkout are separate aggregates and never change commercial pricing or approvals.

## Phase 14 reservation handoff

A newly confirmed order remains `NOT_RESERVED`. Authorised staff can separately
create a full or intentional partial `InventoryReservation` for its exact order
items and dates, complete a shortfall, or release committed capacity. Order item
quantities, price/tax/discount snapshots, quote, decision, and request remain
immutable. Reservation does not mark equipment checked out or fulfilled.

Customer order responses and PDFs omit reservation status, availability,
shortfall, allocation, and asset data. See
[Inventory reservations](inventory-reservations.md).

## Changes after confirmation

A confirmed rental order is immutable in Phase 13. Customer proposals are stored in a separate formal `RentalChangeRequest`; review never changes the order or creates a replacement automatically. Reservation status remains `NOT_RESERVED`, and no inventory mutation, availability calculation, or asset allocation occurs.

Phase 12 implements explicit conversion of an authoritative accepted quote
revision into an immutable confirmed rental order. It does not reserve
inventory, calculate date availability, allocate assets, or start delivery,
return, maintenance, payment, or fulfillment workflows.

## Domain boundary

`Cart -> Rental Request -> Decision -> Quote -> Customer Acceptance -> Confirmed Rental Order -> future Inventory Reservation`

These are separate records. Quote acceptance records the customer's response
only. An active staff user with `order.create` must confirm a separate action
before an order exists. The only implemented order status is `CONFIRMED`; its
fixed reservation state is `NOT_RESERVED`. No Phase 12 endpoint changes either.

## Eligibility and conversion

`POST /admin/quotes/:quoteId/revisions/:revisionId/order` requires an active
staff session and `order.create`. The service locks the quote and rechecks the
actor's live permission in a serializable transaction before replay or writes.

The revision must be `Quote.customerRevisionId`, have lifecycle state
`ACCEPTED`, have a matching immutable accepted response no later than
`validUntil`, belong to the authoritative approved or partially-approved
request decision, and have no existing order. Timely acceptance may be
converted after `validUntil`. Accepted revisions cannot later be replaced.

The body contains only a UUID `operationId`; clients never submit totals or
snapshot data. Exact retries by the same actor and source return the same
result. Conflicting reuse returns `409`. Unique quote, revision, request, and
operation constraints ensure concurrent attempts create at most one order.

## Immutable snapshots and money

`RentalOrder` snapshots contact, project, fulfillment, rental dates, customer
notes, terms, accepted revision identity, and every integer-cent aggregate.
`RentalOrderItem`, `RentalOrderCharge`, and `RentalOrderTax` copy every accepted
commercial source row exactly. Internal quote notes are not copied.

The API recalculates lines, subtotals, taxable amount, basis-point tax using
half-up rounding, and total with `bigint` before copying exact stored values.
PostgreSQL constraint triggers independently verify source identity, complete
child coverage, snapshots, and totals at commit. Order commercial records and
activities are append-only.

## Administrative API and permissions

- `GET /admin/orders` — `order.view`, with server pagination/search/filter/sort.
- `GET /admin/orders/:id` — `order.view`.
- `GET /admin/orders/:id/pdf` — `order.view`.
- `POST /admin/orders/:id/customer-access` — explicit generation;
  `order.view` and `order.update`.
- `POST /admin/orders/:id/customer-access/revoke` — `order.view` and
  `order.update`.
- `POST /admin/orders/:id/customer-access/rotate` — `order.view` and
  `order.update`.
- `POST /admin/orders/:id/customer-access/resend` — `order.view` and
  `order.update`.
- `POST /admin/quotes/:quoteId/revisions/:revisionId/order` — `order.create`.

SUPER_ADMIN receives all order permissions. ADMIN receives `order.view`,
`order.create`, and reserved `order.update`. SALES_PERSON and EDITOR receive no
order permissions by default. Phase 12.1 uses `order.update` only for explicit
customer-access lifecycle actions; it still does not authorize order commercial
or reservation edits.

Admin routes are `/orders` and `/orders/{id}`. The accepted quote detail uses
an accessible confirmation dialog, creates no customer access implicitly, and
links to the order after success. The order detail owns explicit access
controls. UI visibility is not authorization. Quote detail returns an existing
order reference only when
the current staff user also has live `order.view`; `quote.view` alone never
exposes the order ID or order number.

## Dedicated customer access

Order access never reuses a quote capability. Conversion creates only the
immutable order. Staff with live `order.view` and `order.update` explicitly
generate an order-scoped UUID plus HMAC capability; only its SHA-256 hash is
stored. The raw link appears only in an authorized generate, rotate, or resend
response:

`WEB_ORIGIN/order/access#capability=...`

The access page immediately removes the fragment and exchanges it through a
fixed same-origin BFF for a separate host-only, HttpOnly, SameSite=Lax cookie.
Local HTTP uses `Secure=false`; production requires HTTPS, `Secure=true`, an
`__Host-` name, Path=/, and no Domain. Missing, malformed, unknown, expired, and
revoked access all receive the same unavailable response. An order number never
authorizes access.

Private routes are `POST /public/orders/access`, `GET /public/orders/current`,
`GET /public/orders/current/pdf`, and idempotent
`POST /public/orders/current/view`. First view records one
activity. All API/BFF responses are private/no-store/noindex/no-referrer.
`/order` and `/order/access` stay outside the sitemap and are disallowed by
robots as indexing guidance; security never depends on robots.txt.

## Customer-visible data

The public mapper returns only the order number, confirmed/non-reserved state
and notice, customer/project/fulfillment/date snapshots, accepted items,
customer-visible charges/tax/totals/notes/terms, and confirmation time. The web
BFF recursively validates the exact response and fails closed on additions.

It never returns staff identities, internal notes, decision internals, RBAC,
operation or payload IDs, access records, activity, inventory quantities,
states/assets, availability, reservations, or allocation details.

## Phase 12.1 access lifecycle and PDF

Access history is append-only and at most one unrevoked capability may exist.
Admin detail returns only safe state (`NONE`, `ACTIVE`, `EXPIRED`, or
`REVOKED`), expiry, creation, and first-view metadata. Generate creates access;
revoke invalidates it; rotate atomically revokes and replaces it; resend reuses
the active link and expiry. Each mutation is locked, permission checked again,
and idempotent. Resend never silently rotates.

Staff with `order.view`, or the customer holding that exact valid order
capability, can download a private selectable-text PDF from immutable
customer-safe order snapshots. It includes document number, dates, project and
fulfilment, commercial details, `CONFIRMED`, `NOT_RESERVED`, and the scheduling
notice. It excludes staff/activity, source and operation IDs, capabilities,
inventory, availability, reservations, allocations, and capability URLs.

## Environment

- `PUBLIC_ORDER_ACCESS_SECRET`: at least 32 characters, unique from quote
  access, and not a development placeholder in production.
- `PUBLIC_ORDER_ACCESS_TTL_DAYS`: 1–365; default 90 locally.
- `PUBLIC_ORDER_COOKIE_NAME`: `mensah_order_access` locally and an `__Host-`
  name in production.
- `PUBLIC_ORDER_COOKIE_SECURE`: false only for local HTTP; true in production.

## Future reservation handoff

The recommended next phase is customer rental-request amendment handling.
A later reservation phase may create a separate `InventoryReservation` from an
eligible confirmed order using half-open UTC ranges and concurrency-safe bulk
and serialized allocation. It must not expose internal quantities to customers.
Phase 12 provides no reservation transition or inventory service dependency.
