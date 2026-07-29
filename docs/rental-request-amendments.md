# Rental request amendments

Confirmed-order changes remain formal change requests. An unresolved change request blocks fulfilment inside the locked transaction. Amendments never mutate checkout, inventory, or active rentals.

## Phase 14 reservation boundary

Amending a request still creates an immutable request revision and supersedes
the applicable decision/quote workflow; it does not create or change an
inventory reservation. Once a confirmed order has an active reservation, a
future approved order-change workflow must explicitly coordinate reservation
release/replacement. Phase 14 does not infer reservation changes from a
customer proposal.

Phase 13 lets a customer who holds a valid request-scoped capability submit a complete replacement version of a submitted rental request. A reference number, customer name, project name, email address, or phone number is never an access credential.

## Lifecycle and eligibility

Ordinary amendment is allowed while the request is `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `PARTIALLY_APPROVED`, or `REJECTED`, and while its current quote is `DRAFT`, `SENT`, or `VIEWED`. The atomic amendment operation changes the request to `RE_REVIEW_REQUIRED`. Staff explicitly starts the next review, which changes it to `UNDER_REVIEW`; only a new exact-revision decision can return it to a terminal decision status.

An accepted quote or confirmed rental order blocks ordinary amendment. The customer must use a formal change request instead.

## Immutable revision model

Every existing request is backfilled with revision 1. `RentalRequest.currentRevisionId` identifies the sole operational revision. Every amendment creates a new `RentalRequestRevision` and a complete set of `RentalRequestRevisionItem` snapshots. The original `RentalRequest` header and `RentalRequestItem` rows are never rewritten or deleted. Revision numbers are unique per request, and database triggers prevent revision and revision-item updates or deletion.

The complete replacement list must contain at least one unique product with a positive integer quantity. A removed product is absent from the new snapshot and appears as `REMOVED` only when revisions are compared. Newly added products must be active public catalogue products. An archived product already in the base revision may remain in the new revision so history can be preserved. No availability check is performed.

## Concurrency and retries

The request row is locked before the related quote/order rows. The customer submits the expected current revision number, a UUID operation ID, and a bounded payload. A canonical SHA-256 payload hash makes exact retries idempotent. Reusing the operation ID for a different payload or submitting against a stale revision returns `409`.

The transaction creates the revision, amendment link, item snapshots, activity, decision supersession, quote effects, and current pointer together. A partial result cannot become current.

## Re-review, decisions, and quotes

Assignment is preserved, review start is cleared, review version increases, and an append-only amendment activity is recorded. A prior decision remains immutable but is marked operationally superseded and cannot authorize a quote for the new revision. Approved quantities are never copied.

A `DRAFT`, `SENT`, or `VIEWED` quote revision becomes `SUPERSEDED`; customer quote access is revoked and the proposal is non-actionable. Quote history remains. An accepted quote is never changed by ordinary amendment.

The Rental Requests badge counts distinct requests whose current status is `SUBMITTED` or `RE_REVIEW_REQUIRED`. It decreases only when staff explicitly starts review.

## Customer and staff behavior

The private customer page is `/rental-requests/:referenceNumber/amend`. It supports complete equipment editing, active-catalogue search, dates, fulfilment, contact, company, project, delivery, notes, an amendment reason, and a review warning. It is private, no-store, and noindex.

Staff can list revisions, inspect a revision, and retrieve a deterministic server-side comparison. Equipment is classified as `ADDED`, `REMOVED`, `QUANTITY_INCREASED`, `QUANTITY_DECREASED`, or `UNCHANGED`; other changed fields use `FIELD_CHANGED` with old and new values.

## Security and confidentiality

The API stores only capability hashes. Missing, invalid, expired, revoked, and mismatched access all return the same unavailable response. The browser receives only explicit allowlisted customer DTOs. It never receives internal notes, staff identities, permissions, decision internals, operation or payload hashes, inventory states/quantities, availability, reservations, or assets.

Amendments do not create inventory transactions, reservations, allocations, or inventory mutations. Customers may request more than internal stock.
