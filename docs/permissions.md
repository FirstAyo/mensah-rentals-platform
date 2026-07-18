# Permissions and Roles

Phase 2 authenticates staff and protects API routes by default, but it does not
implement role or permission records. Authentication establishes identity;
Phase 3 will add a separate backend authorization guard that evaluates these
permissions.

Mensah Rentals will use permission-based role-based access control (RBAC). The
data model is based on User, Role, Permission, UserRole, and RolePermission.
Roles group permissions; backend guards authorize capabilities. Code must not
scatter checks such as `user.role === "ADMIN"`.

Authorization is deny-by-default and enforced by the API. Frontend route guards
and hidden controls improve usability but do not provide security.

## Initial roles

### SUPER_ADMIN

Full system administration, including users, roles, permissions, operational
data, content, settings, reports, and audit logs. Any protected owner-level
behavior must be centralized and audited rather than implemented as scattered
bypasses.

### ADMIN

Broad operational administration, subject to assigned permissions. ADMIN does
not automatically inherit protected SUPER_ADMIN capabilities.

### EDITOR

Public-facing product and website content management. EDITOR does not
automatically receive confidential inventory, request approval, role,
permission, or protected financial access.

### SALES_PERSON

Customer, rental-request, follow-up, and quotation work within assigned
permissions. SALES_PERSON does not automatically manage roles, permissions,
protected settings, or protected inventory history.

## Inventory confidentiality

Internal quantities require authentication and a specific administrative
permission such as `inventory.quantity.view`. This includes total, available,
remaining, reserved, rented, damaged, maintenance, lost, and calculated
date-range availability values.

No role name alone grants inventory access. Public users, guest customers,
authenticated customers, and customer applications must never receive these
values.

## Authorization direction

- Authentication proves identity; it does not grant every action.
- Roles are permission bundles and custom roles will be supported.
- Permission guards run on protected API actions.
- Customer ownership rules prevent one customer accessing another customer's data.
- Sensitive decisions and permission changes create audit records.
- Future tests cover unauthenticated `401`, unpermitted `403`, permitted success, and customer ownership isolation.
