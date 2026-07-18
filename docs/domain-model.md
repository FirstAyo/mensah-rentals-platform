# Planned Domain Model

Phase 2 implements only the identity/session foundation. Every remaining
domain is direction that will be refined through a reviewed vertical slice and
Prisma migration.

## Identity and access

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

## Inventory

Inventory is separate from products. Future records will represent bulk
capacity, serialized assets, operational state, and append-only inventory
transactions. Internal quantities and availability calculations are
confidential.

## Rental workflow concepts

- **Cart** is temporary customer intent. It does not reserve inventory.
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
