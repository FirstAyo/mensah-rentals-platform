# Maintenance work orders and inspections

Phase 17 adds an internal maintenance workflow downstream of inventory, fulfilment, active rentals, returns, and rental issues. It does not rewrite any source record and it has no public or customer API.

## Domain boundary

`MaintenanceWorkOrder` is the operational aggregate for a bounded equipment target. `EquipmentInspection` is a separate one-time inspection aggregate. `MaintenanceOperation` is the durable idempotency and audit record shared by their mutations. `MaintenanceNote` is append-only internal plain text.

A target is exactly one of:

- bulk inventory: one inventory record and a positive quantity;
- serialized inventory: one inventory record, one exact asset, and quantity one.

The work order snapshots customer-irrelevant equipment display information so history remains readable after catalogue tombstoning. Product, inventory, asset, return, issue, inspection, and staff references use restrictive historical relationships. Maintenance history is never cascade-deleted.

## Work-order sources, types, and priority

Sources are immutable:

- `MANUAL`
- `RETURN_ISSUE`
- `RETURN_DISPOSITION`
- `FAILED_INSPECTION`

Types are `CORRECTIVE`, `PREVENTIVE`, and the narrowly scoped `INSPECTION_FOLLOWUP`. Priorities are `LOW`, `NORMAL`, `HIGH`, and `URGENT`; `NORMAL` is the default.

## Work-order lifecycle

The validated lifecycle is:

```text
OPEN -> ASSIGNED -> IN_PROGRESS -> WAITING_FOR_PARTS
                         |                 |
                         +-----------------+
                         |
                         -> READY_FOR_INSPECTION -> COMPLETED
```

`OPEN` may start directly. Removing the only assignment returns `ASSIGNED` to `OPEN`. `OPEN`, `ASSIGNED`, `IN_PROGRESS`, and `WAITING_FOR_PARTS` may be cancelled when the required reason and permissions are present. `COMPLETED` and `CANCELLED` are terminal and operationally immutable.

A completed work order must have one explicit outcome:

- `RETURN_TO_SERVICE`: `MAINTENANCE -> RENTABLE`;
- `REMAINS_DAMAGED`: `MAINTENANCE -> DAMAGED`.

There is deliberately no completed `REMAINS_MAINTENANCE` outcome. Work that still owns unavailable equipment remains active, normally `IN_PROGRESS` or `WAITING_FOR_PARTS`, so the equipment cannot become an ownerless maintenance balance.

## Inventory transitions and claims

Every physical movement appends an authoritative `InventoryTransaction` linked to the maintenance operation. State changes never alter total physical quantity.

For a manual work order, staff must select the exact current source bucket
(`RENTABLE`, `DAMAGED`, or already `MAINTENANCE`). The API validates that choice
against the live locked balance or exact serialized asset. It never guesses from
the first non-empty bucket. Stock already owned by an active routine inspection
cannot be claimed by a work order.

- Manual preventive work may move `RENTABLE -> MAINTENANCE`.
- Corrective work may move `DAMAGED -> MAINTENANCE`.
- A return that already moved equipment into `MAINTENANCE` is linked without a second movement.
- Successful completion moves `MAINTENANCE -> RENTABLE` exactly once.
- An unresolved repair may move `MAINTENANCE -> DAMAGED` exactly once.

The work order records whether it owns its ingress movement and the ingress source state. Cancellation reverses only an ingress movement owned by that work order. It never guesses a source state or returns inventory claimed by another source.

Bulk operations serialize on the inventory root, validate the live ledger balance, subtract active work-order claims, and account for active reservation/preparation commitments before moving or claiming quantity. Serialized operations lock and validate the exact asset. A database partial uniqueness rule prevents conflicting active work orders for the same serialized asset.

## Return and rental-issue integration

A work order created from a returned item or `RentalIssue` keeps the return, returned asset, disposition, issue, resolutions, and inventory transactions unchanged. Source facts are derived by the API and cannot be replaced by client input.

Creating or completing a work order does not silently resolve an issue. After a successful linked corrective repair, an authorized staff member may explicitly choose **Resolve linked issue as repaired**. That action uses the immutable `RentalIssueResolution` architecture and is coordinated with the maintenance completion transaction so there is only one physical movement.

Missing-item, financial, and customer-responsibility outcomes are never silently closed by maintenance.

## Assignment and scheduling

Only active staff can receive a new assignment. Assignment, reassignment, and removal are audited. A later-disabled assignee remains visible historically but cannot receive new work.

Times are stored as UTC timestamps. Work orders support a scheduled time and due time. The API derives scheduled, due-soon, and overdue workload from current status and timestamps. Phase 17 does not add a recurrence engine or full calendar.

## Inspection lifecycle

Inspection types are `ROUTINE` and `POST_MAINTENANCE`:

```text
SCHEDULED -> IN_PROGRESS -> PASSED
                         -> FAILED
SCHEDULED -> CANCELLED
```

Terminal inspection results are immutable.

A post-maintenance inspection is linked to a work order in `READY_FOR_INSPECTION`. Failure atomically records `FAILED`, returns the work order to `IN_PROGRESS`, and leaves equipment in `MAINTENANCE`. Passing records eligibility; explicit work-order completion performs the one-time return-to-service or damaged transition.

A routine inspection is one-time. Scheduling alone does not move inventory. When a routine inspection must hold rentable equipment, its start operation claims or moves the exact target under the same concurrency rules. Failure keeps it unavailable and permits an explicit corrective follow-up work order. No recurring generator, meter automation, or IoT trigger is included.

## Idempotency, concurrency, and audit

Every mutation accepts a UUID operation ID and a canonical payload. `MaintenanceOperation.operationId` is globally unique. After a live active-user and permission check inside the transaction:

- an exact same-actor/resource/action/payload retry returns the authoritative result;
- reuse with a different action, resource, actor, or payload returns `409`;
- a stale expected version returns `409`;
- impossible quantities, targets, assignees, or source states return `422`.

Serializable transactions, bounded conflict retries, inventory advisory locks, row locks, version checks, partial unique indexes, and append-only database protections prevent double claims and duplicate movements. Activities, operations, notes, inventory history, returns, issues, and completed inspections are not destructively edited.

## Permissions

The permission catalogue contains:

- `maintenance.view`
- `maintenance.create`
- `maintenance.assign`
- `maintenance.update`
- `maintenance.complete`
- `maintenance.cancel`
- `maintenance.note`
- `maintenance.inventory_transition`
- `inspection.view`
- `inspection.create`
- `inspection.perform`
- `inspection.cancel`

`SUPER_ADMIN` and `ADMIN` receive these permissions by default. `EDITOR` and `SALES_PERSON` receive none. Custom read-only roles may receive only the appropriate view permission. The API is authoritative and important transactions recheck that the staff user is active and still holds the exact permission. The admin interface also removes unavailable actions.

## Internal API and admin routes

Administrative APIs use `/admin/maintenance/work-orders` and `/admin/maintenance/inspections`, with fixed action endpoints for assignment, lifecycle commands, notes, and inspection results. List endpoints are paginated and allow bounded server-side search/filter/sort. Responses are explicit internal DTOs and `private, no-store`.

The admin application uses:

- `/maintenance/work-orders`
- `/maintenance/work-orders/new`
- `/maintenance/work-orders/[id]`
- `/maintenance/inspections`
- `/maintenance/inspections/new`
- `/maintenance/inspections/[id]`

The same-origin maintenance BFF has a fixed method/path/query allowlist, exact Origin and JSON checks for mutations, a bounded request body, named staff-cookie forwarding, and sanitized upstream failures. It is not a generic proxy.

## Dashboard definition

Permission-shaped work summaries report current open/unassigned/overdue/waiting/ready work orders and upcoming/overdue/failed inspections. Completed and cancelled history is excluded from active counts. Each aggregate is counted once; overdue is a filtered view, not a second physical record.

## Customer confidentiality

Maintenance data is internal only. Public and customer DTOs contain no work-order or inspection numbers, status, target quantity, asset identity, condition, repair note, staff assignment, priority, cost, activity, operation ID, source link, or result. Public catalogue availability rules remain unchanged: customers never receive inventory quantities or calculated availability.

## Intentionally deferred

Phase 17 does not implement payments, damage charges, repair invoices, parts inventory, purchasing, supplier/vendor portals, recurring maintenance generation, meter/IoT automation, public maintenance status, or customer maintenance notifications.
