# Formal rental change requests

## Phase 14 reservation boundary

A submitted or reviewed formal change request never mutates an active
reservation, accepted quote, or confirmed order. Reservation changes require a
separate authorised order-reservation action. Automatic order revision and
reservation reconciliation remain deferred so customer proposals cannot
silently release or double-book inventory.

A formal change request is separate from a rental-request amendment, quote revision, confirmed order revision, and inventory reservation. It is used only after a quote has been accepted or a rental order has been confirmed.

## Boundary

The server derives the authoritative accepted quote or confirmed order from the request-scoped customer capability. Customers do not submit internal quote or order IDs. A confirmed order takes precedence over its accepted quote as the source.

The accepted quote and confirmed order remain immutable. Submitting or reviewing a change request does not create a replacement quote, replacement order, inventory reservation, availability calculation, inventory transaction, or asset allocation.

## Data and lifecycle

`RentalChangeRequest` records the exact baseline request revision and accepted quote revision or confirmed order, a complete proposed request snapshot, reason, actor capability record, idempotency operation, status, and review version. `RentalChangeRequestItem` stores customer-safe product snapshots and old/proposed quantities.

Statuses are `SUBMITTED`, `UNDER_REVIEW`, `APPROVED_FOR_REQUOTE`, `REJECTED`, `WITHDRAWN`, and `SUPERSEDED`. Staff review changes only the change-request lifecycle. `APPROVED_FOR_REQUOTE` records permission to begin a later controlled commercial workflow; Phase 13 does not create it automatically.

## Access and authorization

Customer endpoints require the request-scoped HttpOnly capability and can access only change requests for that request. Staff listing and viewing require `rental_change_request.view`; reviewing requires `rental_change_request.review`. These permissions are seeded for SUPER_ADMIN, ADMIN, and SALES_PERSON; EDITOR receives neither.

All customer responses are explicit allowlists and private/no-store/noindex. Staff identity, internal review notes, operation IDs, hashes, internal quote/order fields, inventory, availability, and reservations are excluded.

## Concurrency and idempotency

Submission locks the request, quote, and order in that order, rechecks the authoritative source, and rejects stale source state with `409`. A UUID operation ID plus canonical payload hash makes an identical retry return the existing request while conflicting reuse fails. Review requires the expected review version.

Future work may turn an approved change request into a deliberate replacement quote/order workflow. That future action must preserve the original commercial records and implement reservation behavior separately.
