# Fulfilment and checkout

Phase 15 adds internal preparation, picking, physical handoff, and checkout. It does not implement returns, damage, missing equipment, maintenance resolution, payments, or customer accounts.

## Lifecycle and eligibility

A confirmed order has no fulfilment aggregate until an authorised staff member starts preparation. The stored lifecycle is `PREPARING -> READY -> PARTIALLY_CHECKED_OUT -> CHECKED_OUT`.

The order must remain `CONFIRMED`, have valid snapshotted dates, have an operational reservation with actively reserved inventory, have no unresolved formal change request, and the actor must still be active with the exact permission when the transaction executes. `READY` means every currently reserved unit is prepared. The customer label is derived from the immutable method: ready for pickup or ready for delivery.

## Preparation

Preparation stores current quantities in `OrderFulfilmentItem` and records changes in append-only `FulfilmentOperation`/`FulfilmentOperationItem` rows. `PreparedSerializedAsset` preserves the exact current serialized picking set; allocation additions/removals remain auditable as operation-item deltas, and checkout can consume only that prepared set. Prepared quantity cannot exceed active reserved quantity. Preparation creates no inventory movement.

## Atomic checkout and handoff

Pickup/delivery handoff and checkout are one serializable transaction. Pickup requires a recipient at both the service and database boundaries. Delivery uses the immutable destination snapshot and authenticated actor. The first active-rental checkout time, handoff time, fulfilment time, and serialized-asset checkout time use the same validated instant. The transaction locks and revalidates the order, reservation, fulfilment, actor, inventories, and selected assets; consumes commitments; creates inventory movements; creates/updates the single active rental; and records the handoff.

Full versus partial checkout is measured against immutable order quantities. Partial checkout requires `fulfilment.partial_checkout`, explicit confirmation, and an internal reason. Unused reserved quantities remain reserved. Later checkout updates the same active rental.

If an earlier partial reservation has already been fully consumed, later reservation completion counts that consumed quantity toward the immutable order demand and adds only the remaining commitment. The reservation may move from `CONSUMED` back to `PARTIALLY_CONSUMED` solely for this completion case; the consumed quantity and earlier checkout history remain unchanged. Preparing and checking out that later commitment completes the same fulfilment and active rental rather than creating a second aggregate.

## Reservation and inventory accounting

`requestedQuantity = reservedQuantity + consumedQuantity + shortfallQuantity`.

Bulk checkout appends a `BULK_MOVEMENT` from `RENTABLE` to `RENTED`; total physical quantity does not change. Serialized checkout accepts only an actively allocated rentable asset, links it to the active rental, changes it to `RENTED`, and preserves the allocation as `CONSUMED`. Consumed allocations continue blocking overlapping ranges.

Expected return never changes inventory automatically. No return, damage, missing, or maintenance-resolution record is created.

Deferred database identity triggers reject cross-order combinations among fulfilments, reservations, fulfilment items/operations, prepared serialized assets, active rentals/items/assets, and handoffs before a transaction can commit.

## Permissions

- `fulfilment.view`
- `fulfilment.prepare`
- `fulfilment.checkout`
- `fulfilment.partial_checkout`
- `fulfilment.handoff`
- `fulfilment.pdf`
- `active_rental.view`

SUPER_ADMIN/ADMIN receive all. SALES_PERSON receives `fulfilment.view` only. EDITOR receives none. Authority is never inferred from order, inventory, or reservation permissions.

## APIs and documents

- `GET /admin/orders/:orderId/fulfilment`
- `POST /admin/orders/:orderId/fulfilment/start-preparation`
- `PUT /admin/orders/:orderId/fulfilment/preparation`
- `POST /admin/orders/:orderId/fulfilment/mark-ready`
- `POST /admin/orders/:orderId/fulfilment/checkout`
- `GET /admin/orders/:orderId/fulfilment/picking-pdf`
- `GET /admin/orders/:orderId/fulfilment/handoff-pdf`
- `GET /admin/orders/:orderId/fulfilment/active-rental-pdf`

All use strict validation, fixed BFF allowlists, no-store responses, live backend permissions, operation IDs, payload hashes, and optimistic versions. Staff PDFs are selectable text and use stored snapshots. Customer DTOs are separately allowlisted and exclude internal quantities, shortfalls, assets, notes, staff, operations, hashes, and versions.
