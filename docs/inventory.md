# Inventory Foundation

## Phase 15 checkout movement

Bulk checkout appends a movement from `RENTABLE` to `RENTED`; serialized checkout moves the exact allocated asset to `RENTED`. Transactions reference the fulfilment operation. Physical total is unchanged. Expected return does not alter inventory.

## Phase 14 date-range reservations

Confirmed orders now commit operational capacity through a separate
`InventoryReservation`; product descriptions and physical inventory totals are
unchanged. Bulk availability subtracts non-rentable state and overlapping active
reservation deltas. Serialized availability requires an eligible asset with no
overlapping allocation. Intervals use UTC `[start, end)` semantics.

Partial reservations preserve a real shortfall and require the independent
override permission/reason. Releases append inverse deltas or release asset
allocations; they never delete history. See
[Inventory reservations](inventory-reservations.md).

Phase 5 implements confidential present-state inventory. It does not implement rental reservations or requested-period availability.

## Model

- `Inventory` uniquely links a product to immutable `BULK` or `SERIALIZED` tracking after activity and records a unique creation-operation UUID for safe retries.
- `InventoryItem` represents a serialized asset with a globally unique normalized asset number, optional serial number, and operational state.
- `InventoryTransaction` is the authoritative append-only history with a positive magnitude, source/destination state, operation UUID, reason, authenticated actor, and timestamp.

States are `RENTABLE`, `RENTED`, `MAINTENANCE`, `DAMAGED`, `LOST`, and `RETIRED`. `RESERVED` is deliberately absent: a future reservation is a dated allocation, not a permanent equipment state.

Bulk totals are calculated from ledger movements. Serialized totals are calculated from item states. Neither is public availability.

## Integrity and concurrency

Every mutation reloads the active actor's permissions inside the database transaction, locks the inventory header row, validates the source balance or item state, writes the projection where applicable, and appends history atomically. A transaction-scoped advisory lock serializes the rare inventory-definition creation operation. Inventory creation and every ledger mutation use required unique operation UUIDs to prevent retry duplication; the admin retains one UUID for each user intent and reuses it after uncertain failures. Conflicting reuse returns 409. PostgreSQL triggers reject transaction updates/deletes, serialized items under bulk definitions, cross-mode events, and tracking-mode changes after activity.

Integration tests run only in the guarded disposable database named by
`TEST_DATABASE_URL`. The test database is reset and migrated before the full
suite, so append-only fixtures never accumulate in the normal development
database. Tests never disable the append-only triggers or delete individual
ledger entries; resetting the dedicated test database reinstalls the same
production constraints. Test fixtures use recognizable test-only names.

Corrections use compensating transactions; history is never rewritten.

## Administrative routes and permissions

- Metadata list/detail: `inventory.view`
- Quantities and serialized assets: `inventory.view` plus `inventory.quantity.view`
- Creation/movements/assets/transitions: those permissions plus `inventory.adjust`
- History: view/quantity plus `inventory.transaction.view`

Routes are under `/admin/inventory`. There is no `/public/inventory` route. Admin catalogue responses also remain inventory-free.

## Explicit deferrals

Reservations, date ranges, overlap calculations, order allocation, double-booking protection, delivery, return, and maintenance workflows are not part of Phase 5. The future reservation phase will use UTC half-open ranges and dedicated bulk/serialized concurrency controls.

Phase 12 confirmed orders remain non-reserving. Conversion and order reads do
not query or mutate inventory records or calculate availability. `NOT_RESERVED`
is an order workflow fact, not an inventory state. Date-based reservation is a
separate future phase.
