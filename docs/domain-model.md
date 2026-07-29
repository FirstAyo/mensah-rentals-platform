# Planned Domain Model

## Phase 15 implemented models

`OrderFulfilment`, `OrderFulfilmentItem`, `PreparedSerializedAsset`, `FulfilmentOperation`, `FulfilmentOperationItem`, `ActiveRental`, `ActiveRentalItem`, `ActiveRentalSerializedAsset`, and `FulfilmentHandoff` implement preparation and checkout. `PreparedSerializedAsset` is the exact current serialized picking set while append-only operation items preserve its changes. `InventoryReservationItem.consumedQuantity` separates active commitment from physical checkout. These are not return, damage, loss, maintenance-resolution, or payment models.

## Implemented reservation models

- `InventoryReservation` is the versioned one-per-order reservation aggregate.
- `InventoryReservationItem` preserves each exact order-item target, reserved
  quantity, shortfall, and BULK/SERIALIZED mode.
- `InventoryReservationDelta` is the append-only quantity ledger for bulk
  reservation and release changes.
- `SerializedAssetAllocation` preserves active and released asset commitments.
- `InventoryReservationActivity` records actor, action, reason, and safe
  structured metadata.

Reservation dates use UTC half-open ranges. These models reference immutable
order items but do not change them and do not represent checkout, fulfilment,
delivery, active rental, return, damage, or missing-item workflows.

## Implemented request revision and change models

- `RentalRequestCustomerAccess` stores a request-scoped capability hash, expiry, and revocation state.
- `RentalRequestRevision` is a complete immutable header snapshot with a request-unique revision number.
- `RentalRequestRevisionItem` is the immutable complete replacement equipment list for one revision.
- `RentalRequestAmendment` links the base and resulting revisions and provides operation idempotency.
- `RentalRequestDecision` now targets exactly one revision; earlier decisions are retained with one-way supersession metadata.
- `RentalChangeRequest` and `RentalChangeRequestItem` preserve a proposal against an accepted quote or confirmed order without changing either source.

Cart, request, revision, amendment, decision, quote/revision, customer quote response, confirmed order, formal change request, and inventory reservation remain distinct concepts.

The platform implements each domain through reviewed vertical slices and Prisma
migrations while keeping customer, staff, catalogue, inventory, and workflow
boundaries separate.

## Identity and access

Phase 3 implements `Role`, `Permission`, `UserRole`, and `RolePermission`. Both join models use composite primary keys, so a user cannot receive the same role twice and a role cannot receive the same permission twice. `UserRole.assignedById` optionally identifies the assigning staff user. System roles are marked with `isSystem`; future custom roles use the same model.

Effective permissions are calculated as the de-duplicated union of permissions on all current roles. They are loaded from PostgreSQL during authenticated requests rather than stored in a long-lived token.

- **User (implemented)** represents an internal staff identity. It stores a canonical unique email, Argon2id password hash, name, `ACTIVE`/`DISABLED` status, optional last-login time, and timestamps. Password hashes are never response fields.
- **StaffSession (implemented)** stores a unique hash of an opaque browser token, its staff user, creation time, and expiry. Cascading user deletion removes sessions; logout removes the matching session. Only active-user, unexpired sessions authenticate.
- **Role** groups permissions and supports both initial and future custom roles.
- **Permission** names a protected capability.
- **UserRole** and **RolePermission** model many-to-many assignments without hard-coded role checks.

Role, Permission, UserRole, and RolePermission are deliberately not implemented
in Phase 2. Customer identity will be designed separately so optional accounts
do not make guest rental requests dependent on staff-auth assumptions.

## Customers

**Customer** represents the person or organization requesting rentals. Guest
requests remain supported, so a rental request cannot require a user account.
Customer contact and address data will be modeled separately where history and
reuse require it.

## Catalogue

**Product** describes a rentable offering. **Category** organizes products.
Images and specifications may be separate records. Public product projections
contain descriptive information only and never expose operational inventory
quantities.

Phase 4 implements `Category`, `Product`, `ProductImage`, and `ProductSpecification`. Categories and products use stable unique slugs and non-destructive active/inactive publication state. Images and specifications are ordered child records; image metadata includes alt text and one primary marker. Product remains descriptive and has no inventory quantity, price, reservation, cart, request, quote, or order fields. Future inventory will reference `Product.id` through a separate operational model.

## Inventory

Phase 5 implements `Inventory`, `InventoryItem`, and `InventoryTransaction` separately from descriptive products. An inventory definition is uniquely linked to one product and has immutable `BULK` or `SERIALIZED` tracking after activity begins. Bulk balances derive from the append-only movement ledger. Serialized assets have a unique normalized asset number and a current operational state, updated atomically with their history event. Database triggers reject transaction updates/deletes and mode-invalid records.

This current operational state is not date-based rental availability. Reservations, requested-period calculations, cart/request/order links, and double-booking controls remain separate future work. All inventory data is confidential.

## Rental workflow concepts

- **Cart (implemented)** is temporary anonymous customer intent identified by
  a hashed opaque capability and an absolute expiry. It does not reserve
  inventory and has no customer/staff identity relationship.
- **CartItem (implemented)** uniquely pairs one Cart and Product and stores the
  customer's bounded `desiredQuantity`. This is not an available, approved, or
  reserved quantity.
- **GuestRequestSession (implemented)** grants temporary access to one or more
  guest requests through a hashed, expiring browser capability. A readable
  reference is not access. Cleanup deletes the expired session and nulls only
  the request's optional access-session link; it never deletes the request.
- **RentalRequest (implemented)** preserves submitted contact/project/date data,
  fulfillment method, initial `SUBMITTED` state, random reference, and hashed
  idempotency/source-cart identifiers. Submission does not reserve inventory.
- **RentalRequestItem (implemented)** preserves original desired quantities and
  product/category/unit snapshots. PostgreSQL rejects updates and deletion.
- **Quote** contains staff-approved quantities and staff-entered pricing. Revisions preserve history.
- **Rental Order** represents a confirmed operational rental after the appropriate acceptance workflow.
- **Inventory Reservation** is a separate allocation for a defined period at the approved/confirmed stage. It is not the cart, request, quote, or order itself.

Cart, Rental Request, Quote, Rental Order, and Inventory Reservation must never
be collapsed into one generic Order entity.

Future decision records will preserve an approved quantity separately. Partial
approval must never overwrite the implemented original requested quantity.

### Phase 9 request-review models

`RentalRequest` now has an optional active-staff assignee, `assignedAt`,
`reviewStartedAt`, and a monotonically advancing `reviewVersion`. The version
is an optimistic-concurrency boundary for assignment and review-state writes.
Only `SUBMITTED -> UNDER_REVIEW` is activated; this does not represent a
decision or approval.

`RentalRequestInternalNote` is an append-only staff-only note with an author,
validated body, idempotent operation identifier, and timestamp. It is never a
public/customer DTO field.

`RentalRequestActivity` is append-only history for assignment,
reassignment/unassignment, note creation, and review start. It preserves actor,
old/new assignee or old/new state where applicable. These records do not replace
the future cross-domain `AuditLog` model.

The original `RentalRequestItem.requestedQuantity` and product/category/unit
snapshots remain immutable. A later decision model will store approved quantity
separately; Phase 9 deliberately adds no such field and creates no Inventory
Reservation.

## Fulfillment and asset care

- **Delivery** records outbound fulfillment where delivery is selected.
- **Return** records incoming equipment and return outcomes.
- **Maintenance** records work and condition history for affected equipment or assets.

These concepts have their own lifecycle and must not be represented only as an
order status string.

## Audit logs

**AuditLog** preserves important administrative and business actions, including
permission changes, request decisions, quote actions, inventory adjustments,
reservations, and releases. Audit metadata must provide useful context without
unnecessarily copying confidential or secret information.

## Reservation and availability direction

Reservations will use date ranges and account for overlap, operational states,
and both bulk and serialized inventory. The design must prevent concurrent
double-booking through database transactions/locking or constraints; a frontend
check or ordinary availability query is insufficient.

## Implemented decision models

`RentalRequestDecision` is the single immutable terminal decision for a
request. It stores outcome, actor, internal reason, optional customer-safe
explanation, operation/payload identity, review versions, and decision time.
`RentalRequestDecisionItem` covers every immutable request item and stores both
the requested-quantity snapshot and separate approved quantity. Full approval,
partial approval, and rejection have database-enforced quantity shapes. The
one-decision policy intentionally defers revision/supersession semantics.

## Implemented quote aggregate

`Quote` is the one-per-request commercial thread and stores identity, display
number, latest/customer revision pointers, creator, and timestamps.
`QuoteRevision` is tied to the authoritative eligible decision; only the latest
unsent DRAFT and its commercial children may be edited, while every sent or
terminal revision is immutable. `QuoteRevisionLifecycle` is the narrowly
mutable state machine. `QuoteCustomerAccess` stores hash-only append-only access
history and expiry/revocation. `QuoteCustomerResponse` records exactly one
immutable accept/reject response. `QuoteActivity` is append-only internal
history.

Rental Request, Decision, Quote, Revision, Customer Response, future Confirmed Rental Order, and future Inventory Reservation remain different models. Acceptance does not change the terminal request decision and does not create either future model.

## Implemented confirmed rental order aggregate

`RentalOrder` is created explicitly from the authoritative accepted revision.
`RentalOrderItem`, `RentalOrderCharge`, and `RentalOrderTax` copy immutable
commercial/customer snapshots. `RentalOrderActivity` is append-only, and
`OrderCustomerAccess` stores only a hash of a separate expiring capability.

Only `CONFIRMED` and `NOT_RESERVED` exist in Phase 12. There is no inventory
quantity, asset assignment, availability calculation, or reservation relation.
A future `InventoryReservation` remains a separate aggregate.

## Phase 12.1 hardening fields

`QuoteRevision` now snapshots the customer/project/fulfilment/rental-date fields
needed for a stable customer document. It also stores discount type, optional
percentage basis points, pre-tax base cents, calculated discount cents,
taxable-discount cents, and a draft version. Only the latest unsent DRAFT may
change commercial content; sending permanently freezes it. Draft update
activity remains append-only.

`QuoteCustomerAccess` and `OrderCustomerAccess` are append-only one-to-many
histories. A database partial unique index permits at most one unrevoked access
row for a quote revision or order. Each creation has idempotent operation and
payload identity, creator, expiry, and hash-only capability storage. Revocation
does not delete history. `RentalOrder` copies every accepted discount snapshot
field exactly. None of these models relates to inventory or creates a
reservation.
