# Returns and reconciliation

Phase 16 implements staff-only return intake for checked-out rental equipment. A return is not an order edit, reservation edit, payment, or maintenance workflow. The accepted quote, confirmed order, reservation, fulfilment operations, checkout evidence, handoff, and active-rental snapshots remain unchanged.

## Lifecycle

The first finalized intake lazily creates one `RentalReturn` for the `ActiveRental` and snapshots every `ActiveRentalItem.checkedOutQuantity` into a `RentalReturnItem`. This freezes the checkout set. Later checkout is rejected by both the fulfilment service and database triggers.

The stored return states are:

- `PARTIALLY_RETURNED`: at least one checked-out quantity is still outstanding.
- `RECONCILIATION_REQUIRED`: every quantity is accounted for, but one or more blocking issues remain.
- `READY_TO_COMPLETE`: all quantities are accounted for and reconciliation has no blocking issue.
- `COMPLETED`: an authorized staff member explicitly completed the rental.

The active rental moves from `ACTIVE` or `PARTIALLY_ACTIVE` to `PARTIALLY_RETURNED`, then `AWAITING_RECONCILIATION`, and finally `COMPLETED`. A partially active rental cannot be completed while its reservation still has a positive reserved quantity; remaining commitments must be explicitly released first.

## Immutable intake and accounting

Each submitted command creates an immutable `RentalReturnOperation` and one immutable `RentalReturnOperationItem` per affected checkout item. A UUID operation ID, canonical payload hash, expected version, resulting version, actor, and timestamps make retry and concurrency behavior explicit. The mutable `RentalReturn` and `RentalReturnItem` rows are current projections backed by the operation and inventory ledgers.

Missing means confirmed unaccounted equipment, not physically received equipment:

```text
received = rentable + damaged + maintenance
accounted = received + confirmed missing
expected checkout = received + missing + outstanding
```

Quantities are positive bounded integers. An operation cannot exceed the frozen outstanding quantity. For serialized inventory every unit identifies the exact `ActiveRentalSerializedAsset` checkout occurrence. That occurrence may be accounted for once only.

Migration `20260731110000_phase16_return_hardening` enforces the ledger shape at the database boundary: a bulk operation may write one movement per destination state, while a serialized operation writes one movement per exact inventory asset. Multiple serialized assets can therefore share a return line and disposition without colliding.

## Inventory movements

Return intake moves inventory atomically:

- `RENTED -> RENTABLE` for good returns.
- `RENTED -> DAMAGED` for damaged returns.
- `RENTED -> MAINTENANCE` for equipment requiring inspection/maintenance.
- `RENTED -> MISSING` for confirmed missing equipment.

`MISSING` is recoverable and distinct from `LOST`. Recovery later moves `MISSING -> RENTABLE|DAMAGED|MAINTENANCE`; an explicit write-off moves `MISSING -> LOST` or damaged/maintenance equipment to `RETIRED`. Every movement creates an append-only `InventoryTransaction` linked to its return operation or issue resolution. The sum of all physical state buckets does not change during return, recovery, repair, or write-off.

Payment, waiver, responsibility, or an assessed amount never moves inventory and never makes equipment rentable.

## Concurrency and idempotency

Mutations use serializable PostgreSQL transactions with bounded retry. The active rental or return aggregate is the serialization root. Commands reload the active staff user and current permissions inside the transaction, lock affected inventory deterministically, validate the expected version, and commit projection, ledger, issue, and activity changes together. Exact retries return the authoritative result. Reusing an operation ID for a different actor, resource, action, or payload returns `409`; stale versions return `409`; invalid lifecycle or quantity commands return `422`.

## Administrative API

- `GET|POST /admin/active-rentals/:activeRentalId/return`
- `GET /admin/returns`
- `GET /admin/returns/:id`
- `POST /admin/returns/:id/operations`
- `POST /admin/returns/:id/reconcile`
- `POST /admin/returns/:id/complete`
- `POST /admin/returns/:id/issues`
- `GET /admin/returns/:id/receipt-pdf`
- `GET /admin/returns/:id/inspection-pdf`
- `GET /admin/returns/:id/missing-pdf`
- `GET /admin/returns/:id/damage-pdf`
- `GET /admin/returns/:id/reconciliation-pdf`

All are authenticated, permission protected, private/no-store, and available through fixed Next.js BFF allowlists only. Unsafe BFF requests require the exact admin origin, JSON content type, and a body no larger than 64 KiB.

## Staff UI and documents

Return intake is available from `/active-rentals/:id`. `/returns` lists the reconciliation queue and `/returns/:id` shows condition totals, blockers, explicit reconcile/complete actions, and the five internal PDF documents. The layouts stack at 320 px and use the existing semantic light/dark theme.

Staff PDFs are generated from one coherent permission-checked snapshot. They are selectable-text PDFs with private/no-store, noindex, no-referrer, nosniff, and sandbox headers. They may contain asset and condition details and must never be routed through a customer endpoint.

## Customer-safe status

The existing order capability remains the only customer access mechanism. The customer order DTO may show only a coarse status (`PARTIALLY_RECEIVED`, `RECEIVED_REVIEWING`, `ISSUE_UNDER_REVIEW`, or `COMPLETED`), the quantity accounted for, the quantity still with the customer, and a bounded customer-safe message. It never exposes inventory states or balances, asset or serial identifiers, issue type/responsibility/amount, internal notes, staff, operation IDs, hashes, versions, or ledger rows. The customer order PDF uses the same safe projection.

## Deliberately deferred

Payment processing, deposits, gateways, invoices, advanced maintenance work orders, customer accounts, mobile workflows, and public inventory/serial data remain outside Phase 16.
