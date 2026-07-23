# Inventory Foundation

Phase 5 implements confidential present-state inventory. It does not implement rental reservations or requested-period availability.

## Model

- `Inventory` uniquely links a product to immutable `BULK` or `SERIALIZED` tracking after activity and records a unique creation-operation UUID for safe retries.
- `InventoryItem` represents a serialized asset with a globally unique normalized asset number, optional serial number, and operational state.
- `InventoryTransaction` is the authoritative append-only history with a positive magnitude, source/destination state, operation UUID, reason, authenticated actor, and timestamp.

States are `RENTABLE`, `RENTED`, `MAINTENANCE`, `DAMAGED`, `LOST`, and `RETIRED`. `RESERVED` is deliberately absent: a future reservation is a dated allocation, not a permanent equipment state.

Bulk totals are calculated from ledger movements. Serialized totals are calculated from item states. Neither is public availability.

## Integrity and concurrency

Every mutation reloads the active actor's permissions inside the database transaction, locks the inventory header row, validates the source balance or item state, writes the projection where applicable, and appends history atomically. A transaction-scoped advisory lock serializes the rare inventory-definition creation operation. Inventory creation and every ledger mutation use required unique operation UUIDs to prevent retry duplication; the admin retains one UUID for each user intent and reuses it after uncertain failures. Conflicting reuse returns 409. PostgreSQL triggers reject transaction updates/deletes, serialized items under bulk definitions, cross-mode events, and tracking-mode changes after activity.

The integration tests preserve their randomly named inventory ledger fixtures because history is intentionally immutable. They never disable the append-only database triggers. Use the documented development-database reset only when discarding all local data is appropriate.

Corrections use compensating transactions; history is never rewritten.

## Administrative routes and permissions

- Metadata list/detail: `inventory.view`
- Quantities and serialized assets: `inventory.view` plus `inventory.quantity.view`
- Creation/movements/assets/transitions: those permissions plus `inventory.adjust`
- History: view/quantity plus `inventory.transaction.view`

Routes are under `/admin/inventory`. There is no `/public/inventory` route. Admin catalogue responses also remain inventory-free.

## Explicit deferrals

Reservations, date ranges, overlap calculations, order allocation, double-booking protection, delivery, return, and maintenance workflows are not part of Phase 5. The future reservation phase will use UTC half-open ranges and dedicated bulk/serialized concurrency controls.
