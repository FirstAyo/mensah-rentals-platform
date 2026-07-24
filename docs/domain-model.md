# Planned Domain Model

Phase 2 implements only the identity/session foundation. Every remaining
domain is direction that will be refined through a reviewed vertical slice and
Prisma migration.

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
  reserved quantity. Rental dates and request snapshots remain Phase 8 work.
- **Rental Request** preserves what the customer asked for, requested dates, and project/contact details. Submission does not reserve inventory.
- **Quote** contains staff-approved quantities and staff-entered pricing. Revisions preserve history.
- **Rental Order** represents a confirmed operational rental after the appropriate acceptance workflow.
- **Inventory Reservation** is a separate allocation for a defined period at the approved/confirmed stage. It is not the cart, request, quote, or order itself.

Cart, Rental Request, Quote, Rental Order, and Inventory Reservation must never
be collapsed into one generic Order entity.

Rental request items preserve both the original requested quantity and any
separately approved quantity. Partial approval must not overwrite customer
history.

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
