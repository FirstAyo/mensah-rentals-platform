# Inventory management

Phase 18.3 gives authorized staff a discoverable way to maintain Mensah-owned equipment without treating inventory as an editable counter. The NestJS API remains the authority for every stock-changing operation. The Admin application only collects a validated command and displays the resulting ledger-derived state.

## Ledger-driven quantities

Bulk quantities are derived from immutable `InventoryTransaction` rows. Serialized quantities are derived from individually identified `InventoryItem` assets and their append-only transitions. There is no editable `totalQuantity` field.

This distinction is essential. Changing “20” directly to “30” would lose the fact that ten units were purchased, who recorded them, and why. The supported operation instead appends a ten-unit acquisition into `RENTABLE`; the resulting physical total becomes thirty. Corrections use compensating transactions and never rewrite history.

Physical states and reservation commitments are separate. `RENTABLE`, `RENTED`, `DAMAGED`, `MAINTENANCE`, `MISSING`, `LOST`, and `RETIRED` describe equipment state. A date-range reservation is an operational commitment against eligible equipment; it is not another physical state.

## Inventory actions

The inventory detail page exposes only actions valid for the tracking mode and current staff permissions:

- **Edit inventory** changes permitted operational metadata. It cannot edit quantity, product association, asset identity, reservation history, or transaction history. Tracking mode cannot change after stock, assets, or history exist.
- **Add stock** is available for bulk inventory. It requires a positive bounded integer and a meaningful reason. New usable purchases enter `RENTABLE` and append acquisition history.
- **Reduce / retire stock** is available for eligible uncommitted bulk `RENTABLE` units. It requires a reason type and explanation, reduces owned physical stock through an immutable transaction, and cannot consume rented, maintained, damaged, missing, reserved, or otherwise committed units.
- **Add serialized asset** is available for serialized inventory. Each asset receives its own unique internal asset identity and adds exactly one physical unit. Serialized inventory never offers a numeric “add quantity” shortcut.
- **Delete / Archive** is always discoverable for authorized staff. The API preflight selects whether a truly unused record may be deleted, a historical record may be archived, or a live blocker must be resolved. **Restore inventory** remains visible on archived records, and hard delete is offered there only when the API confirms eligibility.

All mutations use a client-generated operation UUID. Replaying the same operation and payload returns the original outcome without duplicating stock. Reusing an operation UUID with a different payload returns `409`. Database transactions and inventory-root locking ensure concurrent additions are cumulative and concurrent reductions cannot create a negative or overcommitted balance.

## Adding newly purchased equipment

For bulk inventory:

1. Sign in to Admin and open **Inventory**.
2. Select the relevant bulk inventory record.
3. Choose **Add stock**.
4. Enter the positive quantity and a specific acquisition reason. Add a supplier or purchase reference when available.
5. Review the current and resulting physical totals, then confirm.
6. Verify the new `RENTABLE` quantity and the immutable stock-addition entry in transaction history.

Adding stock does not rewrite an existing reservation shortfall or silently replace a `SUBRENT` or partner-source plan. Staff may separately revisit the normal reservation workflow and reserve newly eligible stock.

For serialized inventory, use **Add serialized asset** and enter each asset's internal tag and supported serial/acquisition information. Asset and serial identifiers are internal only.

## Reduction and correction

Ownership reductions are deliberate administrative commands, not physical-state transitions. Supported reasons include sale, retirement, disposal, exceptional inventory correction, and a bounded “other” explanation. An inventory correction requires enough detail to explain the discrepancy and must never substitute for checkout, return, maintenance, issue, or reservation workflows.

Only uncommitted eligible stock can be removed. The API reloads current quantities and commitments inside the transaction. Active reservations, unfinished fulfilment, rented equipment, unresolved returns, maintenance work, and other operational claims remain intact and can block the command. Equipment in maintenance still belongs to Mensah Rentals; it must complete the appropriate maintenance/state workflow before retirement.

## Delete, archive, and restore

Permanent deletion is deliberately rare. It is allowed only for a zero-stock inventory definition with no transactions, serialized assets, reservations, fulfilment, rentals, returns, maintenance, inspections, issues, or other historical references. Eligibility is calculated by the API inside the delete transaction; the browser does not decide it.

If history exists, the record cannot be permanently deleted. When no live operational blocker exists, Admin offers an explicit archive action instead. Archived inventory:

- remains available to historical orders, reports, transactions, and audit;
- is hidden from the default active inventory list but appears under the Archived filter;
- cannot receive new reservations or operational stock commands;
- can be restored by an authorized user when its parent product and current state permit it.

An active reserved quantity, checkout/rental, unfinished return, maintenance commitment, or another unresolved operation can block archival. Immutable `CONSUMED` reservation history with zero remaining reserved quantity does not block an otherwise safe archive. The UI explains the safe next step without displaying raw database errors. Restoring inventory never automatically restores an inactive or tombstoned product.

Generic state changes cannot shortcut operational workflows. The narrow manual condition action only supports `RENTABLE -> DAMAGED`. Checkout owns `RENTED`, return reconciliation owns `MISSING`, and maintenance owns entry to and release from `MAINTENANCE`. Newly acquired bulk stock and serialized assets may start only as `RENTABLE`, `MAINTENANCE`, or `DAMAGED`.

Delete and archive use accessible project dialogs, never `window.confirm()` or `window.alert()`. The dialog has a title, description, explicit Cancel action, destructive confirmation, Escape support, focus containment/restoration, pending-state protection, and friendly success or error feedback.

The inventory list also exposes **View**, **Edit**, **Add stock** (for active bulk records), and **Delete / Archive** or **Manage lifecycle** links. Lifecycle actions are not hidden merely because permanent deletion is unsafe.

Internal operational notes are loaded from the authoritative inventory response, displayed on the detail page, prefilled on the next edit, and reloaded after every successful PATCH. Each update emits `INVENTORY_UPDATED` with before/after note values in Platform Audit history. Quantity and immutable transaction history are never editable through this metadata form.

Success and failure are announced by the shared Admin notification system as top-right, accessible, automatically dismissing messages. Inventory uses the exact messages documented in [Admin notifications](admin-notifications.md), while the detail view continues to show durable inline state and errors.

## Permissions and audit

`inventory.view` and `inventory.quantity.view` protect internal state. Stock changes and serialized-asset creation require `inventory.adjust`. Inventory metadata, archival, restoration, and permanent deletion use the exact inventory-management permission selected by the Phase 18.3 RBAC catalogue. These sensitive permissions are seeded for `SUPER_ADMIN` and `ADMIN`, not `EDITOR` or `SALES_PERSON`. Backend guards and live transactional permission checks are authoritative; hidden controls are only a usability aid.

Every significant operation creates durable evidence. Inventory transactions retain physical deltas and reasons. Platform audit events retain the actor, time, safe inventory/product snapshot, before/after context, operation identity, and action such as inventory update, stock addition/reduction, archive, restore, or permanent deletion. A permanent-delete audit snapshot does not use a foreign key that would prevent an otherwise safe deletion.

## Confidentiality

Inventory definitions, physical totals, reservation commitments, acquisition or retirement reasons, archived records, asset/serial identifiers, transactions, and audit events are staff-only. The public catalogue and customer order/PDF DTOs remain explicit allowlists and do not query or serialize this information. Customers may request any positive quantity regardless of current stock.

## Local verification

Use only the guarded `mensah_rentals_test` database for destructive fixtures. Stop normal development servers before the isolated browser harness:

```powershell
docker compose up -d postgres-test
pnpm test:e2e:inventory-management
pnpm test:e2e:admin-notifications
```

The suite covers bulk acquisition and metadata editing at 320px, lifecycle dialogs and serialized-asset creation at 1440px, public confidentiality, dark mode, focus behavior, overflow, and serious/critical Axe findings. PostgreSQL integration tests—not the browser fixture—prove active-reservation reduction blocking and consumed-history archival.

Phase 18.3 adds migrations `20260810190000_inventory_management_enum_values`, `20260810190100_inventory_management_lifecycle`, and `20260810190200_inventory_archive_live_commitment_fix` (52 migrations total at completion).

Run the complete verification gates before committing:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:integrity
pnpm rbac:verify
git diff --check
```

Never run `prisma migrate reset`, `db push --force-reset`, `TRUNCATE`, or delete Docker volumes against the development database.
