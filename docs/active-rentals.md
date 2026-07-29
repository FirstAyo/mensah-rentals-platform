# Active rentals

An `ActiveRental` is created only by the first successful authorised checkout. It is distinct from the confirmed order, reservation, fulfilment, handoff, and future return intake.

## Lifecycle

- `PARTIALLY_ACTIVE`: less than the confirmed commercial quantity has left Mensah Rentals.
- `ACTIVE`: every confirmed commercial quantity has been checked out.

There is exactly one active rental per order and fulfilment. Later checkout updates it. `COMPLETED` is deferred until returns exist.

`ActiveRentalItem` stores cumulative checked-out quantities. `ActiveRentalSerializedAsset` preserves exact allocation/asset identity. `FulfilmentHandoff` records every partial or full pickup/delivery event.

## Expected return

`expectedReturnAt` reuses reservation `rangeEndExclusiveUtc`: local midnight immediately after the inclusive order end date, converted using the snapshotted IANA timezone. Staff overdue state is derived when current time reaches that boundary; it never mutates inventory. Customers see only the inclusive expected return date.

## Routes and visibility

- `/active-rentals`
- `/active-rentals/:activeRentalId`
- `GET /admin/active-rentals`
- `GET /admin/active-rentals/:activeRentalId`

All require `active_rental.view`. Dashboard counts include active rentals, expected returns today, and overdue active rentals only for authorised staff. Phase 15 provides no return, damage, missing, maintenance, or payment controls.
