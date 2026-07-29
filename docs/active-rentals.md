# Active rentals

An `ActiveRental` is created only by the first successful authorised checkout. It is distinct from the confirmed order, reservation, fulfilment, handoff, and Phase 16 return intake.

## Lifecycle

- `PARTIALLY_ACTIVE`: less than the confirmed commercial quantity has left Mensah Rentals.
- `ACTIVE`: every confirmed commercial quantity has been checked out.

There is exactly one active rental per order and fulfilment. Later checkout updates it only until the first finalized return freezes the checkout set. Phase 16 adds `PARTIALLY_RETURNED`, `AWAITING_RECONCILIATION`, and explicit `COMPLETED` states.

`ActiveRentalItem` stores cumulative checked-out quantities. `ActiveRentalSerializedAsset` preserves exact allocation/asset identity. `FulfilmentHandoff` records every partial or full pickup/delivery event.

## Expected return

`expectedReturnAt` reuses reservation `rangeEndExclusiveUtc`: local midnight immediately after the inclusive order end date, converted using the snapshotted IANA timezone. Staff overdue state is derived when current time reaches that boundary; it never mutates inventory. Customers see only the inclusive expected return date.

## Routes and visibility

- `/active-rentals`
- `/active-rentals/:activeRentalId`
- `GET /admin/active-rentals`
- `GET /admin/active-rentals/:activeRentalId`

All require `active_rental.view`. Return intake additionally requires the Phase 16 return permissions. Dashboard counts separate active/overdue rentals, returns awaiting reconciliation, and unresolved issues. Payment controls remain deferred.
