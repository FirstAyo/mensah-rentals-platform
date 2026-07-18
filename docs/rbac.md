# Role-Based Access Control

## Architecture

Phase 3 implements staff-only permission RBAC with `User -> UserRole -> Role -> RolePermission -> Permission`. Authentication first validates the opaque database session and active user. It then returns freshly resolved roles and effective permission keys. The global permission guard evaluates `@RequirePermissions(...)`; all listed permissions are required.

No permissions are stored in browser tokens or local storage, and no permission cache is used. Revocation therefore takes effect on the next authenticated request. Disabled-user checks remain part of session validation.

## Data model

- `Role`: unique canonical name, display name, optional description, system marker, timestamps.
- `Permission`: unique dotted key, description, creation timestamp.
- `UserRole`: composite primary key `(userId, roleId)`, optional assigning user, timestamp.
- `RolePermission`: composite primary key `(roleId, permissionId)`, timestamp.

Composite keys prevent duplicate assignments. Foreign keys cascade user/role assignment cleanup; permission deletion is restricted while assigned. Database checks enforce uppercase snake-case role names and lower dotted permission keys.

## Authorization flow

1. Origin protection handles browser state-changing requests.
2. The staff session guard hashes the opaque cookie, loads the live active user, roles, and permissions, and attaches a safe principal.
3. The permission guard reads route metadata and returns 403 unless the authenticated principal holds every required key.
4. RBAC mutations acquire a PostgreSQL transaction advisory lock, reload the actor's live permissions, validate targets, enforce privilege and last-super-admin rules, then commit atomically.

## Protected administrative APIs

- `GET /admin/roles` — `role.view`
- `GET /admin/permissions` — `role.view`
- `GET /admin/roles/:roleId` — `role.view`
- `PUT /admin/roles/:roleId/permissions` — `role.manage_permissions`
- `PUT /admin/users/:userId/roles` — `user.role.manage`
- `DELETE /admin/users/:userId/roles/:roleId` — `user.role.manage`

Adding/removing `SUPER_ADMIN` additionally requires `role.super_admin.manage`. Payloads use unique CUID arrays and reject unknown fields. These are staff administrative routes and are not public or customer APIs.

## Seeding and local bootstrap

Run `pnpm rbac:seed`. The seed is idempotent and non-destructive as described in [permissions.md](./permissions.md). In development only, the configured bootstrap email receives `SUPER_ADMIN` if that user is active and has no roles. `pnpm staff:bootstrap` runs the seed first, creates a missing user with `SUPER_ADMIN`, promotes an existing active zero-role user, and leaves every other existing user unchanged.

## Administration and audit direction

Phase 3 supplies APIs, not a polished role-management screen. A later screen can list catalogue entries and call these contracts. Future custom-role creation, metadata update, and deletion APIs must protect system roles.

The future audit module must record role assignment/removal and permission changes with actor, target user/role, previous and new IDs, time, and safe request context. It must also record future custom-role creation and archival. Passwords, session tokens, and secrets must never enter audit metadata.
