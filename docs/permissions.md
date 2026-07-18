# Permissions and Roles

Authorization is permission-based. Roles collect permissions; users may have multiple roles; effective permissions are the de-duplicated union of every assigned role. The API enforces permissions. Admin navigation filtering is only a usability aid.

## Final Phase 3 permission catalogue

- Products: `product.view`, `product.create`, `product.update`, `product.delete`
- Categories: `category.view`, `category.create`, `category.update`, `category.delete`
- Inventory: `inventory.view`, `inventory.quantity.view`, `inventory.adjust`, `inventory.transaction.view`
- Rental requests: `rental_request.view`, `rental_request.assign`, `rental_request.update`, `rental_request.approve`, `rental_request.partially_approve`, `rental_request.reject`
- Quotes: `quote.view`, `quote.create`, `quote.update`, `quote.send`, `quote.approve`
- Orders: `order.view`, `order.create`, `order.update`
- Customers: `customer.view`, `customer.update`
- Users: `user.view`, `user.create`, `user.update`, `user.delete`, `user.role.manage`
- Roles: `role.view`, `role.create`, `role.update`, `role.delete`, `role.manage_permissions`, `role.super_admin.manage`
- Content: `content.view`, `content.create`, `content.update`, `content.delete`
- Reports and audit: `report.view`, `audit_log.view`

`user.role.manage` and `role.super_admin.manage` refine the original suggested catalogue. Separating role assignment from general user updates and owner-role assignment from ordinary role management prevents accidental privilege escalation.

## Seeded roles and exact mappings

### SUPER_ADMIN

Receives all 45 catalogue permissions. The seed additively grants any newly introduced catalogue permission to this role.

### ADMIN

Receives: all `product.*`, all `category.*`, all four inventory permissions, all six rental-request permissions, all five quote permissions, all three order permissions, both customer permissions, `user.view`, `user.create`, `user.update`, `role.view`, all four content permissions, and `report.view`.

It does not receive `user.delete`, `user.role.manage`, any role mutation permission, `role.super_admin.manage`, or `audit_log.view`.

### EDITOR

Receives exactly: all four product permissions, all four category permissions, and all four content permissions.

It does not receive confidential inventory quantities, inventory adjustment, rental decisions, user/role management, reports, or audit logs.

### SALES_PERSON

Receives exactly: `product.view`, `category.view`, `inventory.view`, `inventory.quantity.view`, `rental_request.view`, `rental_request.assign`, `rental_request.update`, `quote.view`, `quote.create`, `quote.update`, `quote.send`, `customer.view`, and `customer.update`.

The confidential quantity permission is an explicit internal grant. It does not receive approval/rejection, role management, owner-level, inventory-adjustment, report, or audit permissions.

## Custom roles and seed behavior

The schema supports future custom roles (`isSystem = false`). The idempotent seed creates missing catalogue entries and system roles. It populates a non-super system role only when that role is first created, so later intentional mapping changes are not overwritten. It never deletes custom roles or permissions. A reserved role name found as a custom role causes the seed to fail safely.

## Super-admin protections

- `SUPER_ADMIN` is a protected system role and its permission mapping cannot be edited through Phase 3 APIs.
- Adding or removing it requires both `user.role.manage` and `role.super_admin.manage`.
- The last active staff user holding `SUPER_ADMIN` cannot lose it.
- An actor cannot assign a role or permission set containing permissions the actor does not hold.
- System-role deletion and renaming are impossible because Phase 3 exposes no role metadata/deletion endpoints.

## Inventory confidentiality

`inventory.quantity.view` is required for operational quantities. Customers, guest users, customer accounts, public APIs, and future customer mobile clients must never receive total, available, remaining, reserved, rented, damaged, maintenance, or lost quantities. Frontend hiding is not a security boundary.
