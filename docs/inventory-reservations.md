# Inventory reservations

## Phase 15 consumption

Checkout adds explicit `consumedQuantity` and `PARTIALLY_CONSUMED`/`CONSUMED` states. Requested equals active reserved plus consumed plus shortfall. Remaining quantities stay reserved until later checkout or explicit release; history is never deleted.

Phase 14 commits inventory internally to confirmed rental orders for a defined
rental period. A reservation is not checkout, fulfilment, delivery, an active
rental, a return, or a change to the commercial order snapshot.

## Eligibility and lifecycle

Only a current `CONFIRMED` order with valid dates and live reservation
permissions may be reserved. The API reloads the order, quantities, dates,
inventory, staff status, and permissions inside the mutation transaction; it
does not trust browser values.

The order reservation states are `NOT_RESERVED`, `PARTIALLY_RESERVED`,
`RESERVED`, `RESERVATION_FAILED`, and `RELEASED`. The reservation aggregate may
briefly be `PENDING`, then becomes `PARTIALLY_RESERVED`, `RESERVED`,
`RESERVATION_FAILED`, or `RELEASED`. One active aggregate belongs to an order.
Additional quantities and releases advance its version and add history instead
of replacing earlier actions.

## Dates and availability

Inclusive rental business dates are snapshotted on the order. The reservation
service interprets those dates in the snapshotted IANA business timezone and
normalizes the derived boundaries to UTC. Intervals are half-open: `[start,
end)`. Two periods
overlap only when `existing.start < requested.end` and
`requested.start < existing.end`. An order ending at exactly the next order's
start therefore does not conflict. Phase 14 does not add setup or turnaround
buffers; that policy must be added deliberately later.

For bulk equipment, the server derives:

```text
physical rentable quantity
- damaged, maintenance, missing, retired, and other non-rentable state
- active quantity reserved by overlapping [start, end) periods
= available to reserve internally
```

Future checked-out quantities will join this formula in the fulfilment phase.
Availability is recalculated in the reservation transaction and is never a
public field or authoritative stored snapshot.

## Bulk, partial, and shortfall behavior

The reservation target is the immutable confirmed-order item quantity. A full
reservation succeeds only when all required bulk quantity and selected
serialized assets can be committed. An intentional partial reservation records
the ordered, reserved, and unresolved shortfall quantities without lowering the
order quantity or making inventory negative. Later completion adds only the
missing delta.

Partial/override behavior requires `inventory.reservation.override`, an
internal reason, and append-only activity. Only `SUPER_ADMIN` and `ADMIN`
receive that permission by default. The override records a real unresolved
shortfall; it never pretends unavailable stock or assets exist.

## Serialized assets

Staff explicitly select eligible assets. The API verifies that every asset
belongs to the order product, is in a rentable state, and has no overlapping
active allocation. PostgreSQL exclusion constraints prevent two active
allocations for the same asset and overlapping periods, including concurrent
requests. Asset numbers, serials, and allocations are administrative only.

Catalogue archival controls public publication, not fulfilment of an immutable
confirmed order. Internal availability and eligible-asset checks therefore
continue to use existing inventory for an archived product snapshot. Inventory
state and reservation permissions remain authoritative.

## Release and accounting

Staff may release all of a reservation, a positive bulk quantity, or named
serialized allocations. Release requires a reason, is transactional and
idempotent, recalculates the aggregate/order reservation status, and makes the
released capacity available to overlapping future reservations. Allocation,
delta, and activity rows remain historical; they are not deleted.

Reservation deltas affect operational reserved availability but never total
physical inventory. Phase 14 does not change rented-out or returned quantities
and does not create checkout, delivery, return, damage, or missing-item rows.

## Security, API, and admin UI

Backend permissions are independently enforced for reservation view, create,
update, release, override, and availability view. The admin BFF permits only
the documented order-reservation paths, forwards the named HttpOnly staff
cookie, applies exact Origin and JSON checks to mutations, limits bodies to 32
KB, and strips unknown query parameters.

The order detail page shows ordered, reserved, shortfall, date-range available,
explicit serialized selection, partial/full/completion/release controls, and
activity only to appropriately permitted staff. Dashboard reservation counts
and the Rental Orders badge are omitted without reservation-view permission.
The actionable awaiting-reservation count includes only current or future
confirmed orders in `NOT_RESERVED` or `RESERVATION_FAILED`; terminal `RELEASED`
and already-ended orders do not create permanent work badges.

No public or customer response contains reservation status, quantity,
shortfall, internal availability, asset identity, or reservation history.

## Safe local and browser testing

Use only the guarded local test database whose name ends in `_test`:

```powershell
pnpm test:e2e:admin-reservations
pnpm test:e2e:reservation-concurrency
pnpm test:e2e:reservations
```

The harness refuses ordinary development, staging, or production databases,
requires ports 3000, 3001, and 4000 to be free, resets only the isolated test
database, seeds test-owned staff/catalogue/inventory, and stops its application
processes afterward.

The first reservation migration enables PostgreSQL's `btree_gist` extension.
Local Docker uses a database owner that may do this. Staging and VPS deployments
must either grant the migration role extension-creation authority or have an
administrator pre-provision `btree_gist` before applying the migration.

Checkout, fulfilment, delivery/pickup execution, active rentals, returns,
damage, missing equipment, maintenance resolution, and payments remain
explicitly deferred.
