# Rental Request Foundation

Phase 8 implements guest rental-request submission and private customer-safe
tracking. It does not implement staff review, approval, availability,
reservations, pricing, quotes, orders, notifications, or customer accounts.

## Customer flow

1. A guest adds public products and desired quantities to the server-backed
   cart.
2. `/rental-request` collects contact, project, date, fulfillment, and optional
   customer-note details using the shared Zod contract.
3. The review step repeats the original desired quantities and explains that
   submission is not approval, a reservation, or a final price.
4. The API reads the authoritative cart, creates the request and immutable item
   snapshots in one PostgreSQL transaction, then consumes the cart.
5. The browser receives a readable reference and moves to
   `/rental-requests/<reference>`.
6. Tracking requires both the reference and a separate browser capability.

No account is required. The models can later add an optional customer relation,
but account and guest submissions must continue to preserve submitted contact
snapshots.

## Data model

- `GuestRequestSession` stores only a SHA-256 hash of an opaque guest capability
  plus its expiry. One browser session may own multiple requests.
- `RentalRequest` stores a random unique `MR-YYYY-XXXXXXXXXX` reference,
  idempotency/source-cart hashes, initial `SUBMITTED` state, fulfillment,
  submitted contact/project/date data, and its guest-session relation.
- `RentalRequestItem` stores the original requested quantity and customer-visible
  product/category/unit snapshots. A PostgreSQL trigger rejects update or delete.

The submitted fields on `RentalRequest` are also protected by a focused database
trigger. Future phases may change lifecycle fields without rewriting customer
history. Approved quantities will be modeled separately in Phase 10.

## Security and privacy

The readable reference is an identifier, not authorization. The API generates a
43-character HMAC capability from a random session ID, stores only its hash, and
returns the raw value only in an internal response header. The Next.js BFF stores
it in an `HttpOnly`, `SameSite=Lax`, path-root cookie. It never appears in JSON,
URLs, localStorage, analytics, or application logs.

POST requests require exact `WEB_ORIGIN`, JSON, a bounded body, and a fixed BFF
route. Submission and tracking enforce per-capability limits plus a separately
configured high global safety ceiling in a hard-bounded counter store. Missing, expired,
incorrect, and unauthorized tracking access all receive the same customer-safe
not-found response. Public DTOs are allowlisted and exclude contact information,
notes, cart/session identifiers, staff/RBAC data, prices, inventory, availability,
approval internals, and reservations.

Development uses non-Secure cookies over `http://localhost`. Production requires
HTTPS, `PUBLIC_REQUEST_COOKIE_SECURE=true`, and an `__Host-` cookie name. The
cookie is scoped to the customer website host; the BFF, not browser JavaScript,
forwards it to the API. The API deliberately does not apply a customer-sized
limit to its socket peer because that peer is the shared Next.js BFF, not the
customer. The in-process capability/global limiter is suitable for one local or
single-process deployment. Production should add per-client abuse controls at a
trusted edge that overwrites untrusted forwarding headers. Before horizontal
API scaling, replace the in-process counters with a shared reverse-proxy or
distributed limiter.

## Atomicity and idempotency

The browser creates a UUID submission ID. The API hashes it and the normalized
payload, locks the active cart row, validates that all selected catalogue records
remain active, creates request snapshots, and deletes the cart in one transaction.
Unique constraints prevent a submission ID or source cart from producing two
requests. An identical retry returns the original request only while its guest
tracking session remains valid; replay never reactivates expired access. Reuse
with different data is rejected. A failed submission leaves the cart intact.

Request submission never imports inventory data, calculates availability, or
creates an inventory transaction/reservation. A customer may request 100 units
when internal capacity is 2; staff handles supply later while the original 100
remains preserved.

## Routes

Public API:

- `POST /public/rental-requests`
- `GET /public/rental-requests/:referenceNumber`

Customer website:

- `/rental-request`
- `/rental-requests/:referenceNumber`
- `/track-request`

All request/tracking pages are `noindex`, excluded from the sitemap, and
disallowed in production robots rules. Robots rules are not an access control;
the guest capability remains mandatory.

## Deferred work

Phase 9 adds the staff review queue, assignment, confidential availability, and
internal notes. Phase 10 adds approval/partial approval/rejection and separate
approved quantities. Verified cross-device recovery, customer authentication,
email notifications, quotes, reservations, and orders remain later work.
