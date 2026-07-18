# Architecture

## Overall architecture

Mensah Rentals uses a TypeScript monorepo managed by pnpm and Turborepo. The
customer website, admin dashboard, and API are independently deployable
applications. Shared packages reduce duplication without allowing frontend
applications to bypass backend security boundaries.

Dependency direction is one way: applications may depend on shared packages;
shared packages never depend on applications. `packages/database` is available
only to `apps/api`. Neither Next.js application may import Prisma, database
entities, or internal API implementation code.

## Customer web application boundary

`apps/web` is the public Next.js application. It will eventually support the
catalogue, guest and authenticated customer journeys, request tracking, and
customer-safe account views. It communicates with public or customer API
routes only. It never receives internal inventory quantities, internal notes,
or administrative records.

## Admin application boundary

`apps/admin` is a separate Next.js application for authorized staff. It will
eventually use authenticated administrative API routes. Hiding a button or
protecting a frontend route is not authorization; every protected operation is
also authorized by the API.

## Backend API boundary

`apps/api` is the NestJS REST API and the sole database authority. Controllers
remain thin, application services own business logic, and database access is
provided through narrow server-only boundaries. Future modules and route
namespaces will separate public, customer-account, and administrative
contracts. Prisma records will not be returned directly from controllers.

The foundation provides:

- `GET /health` for API liveness.
- `GET /health/database` for PostgreSQL readiness using `SELECT 1`.
- `POST /auth/login`, `POST /auth/logout`, and `GET /auth/me` for staff
  authentication.

Health responses expose status only. They never include connection strings,
credentials, hostnames, schema names, query text, stack traces, or database
versions.

## Shared packages

- `packages/config` owns build-time TypeScript conventions. Runtime browser and server configuration must remain separate so secrets cannot enter client bundles.
- `packages/database` owns Prisma configuration, migrations, client generation, and the shared client. Only the API consumes it.
- `packages/auth` owns server-only Argon2id password and opaque session-token primitives. It contains no browser state or authorization policy.
- `packages/types` owns deliberately shared, runtime-free contracts. Future public and administrative DTOs must be separately named rather than represented by a universal product type.
- `packages/validation` owns Zod schemas that are genuinely shared. It must not become a channel for exposing internal fields.
- `packages/ui` owns only genuine cross-application primitives. Public and admin visual systems may diverge where their needs differ.

## Database boundary

PostgreSQL is the authoritative datastore and Prisma is the ORM. Schema changes
are made through reviewed Prisma migrations, not manual production edits. Phase
3 contains staff `User`, `UserStatus`, database-backed `StaffSession`, and the
four RBAC models. It has no rental business tables.

Money will use PostgreSQL decimal types. Important entities will use keys,
constraints, indexes, and timestamps. Historical business records will be
preserved through transaction/audit records and soft deletion where required.

## Public versus administrative API data visibility

The API uses allowlisted queries, response mappers, and dedicated response DTOs.
Public output is never produced by serializing a Prisma entity and deleting
sensitive properties afterward.

Public and customer responses must never contain total, available, remaining,
reserved, rented, damaged, maintenance, lost, or calculated date-range
availability quantities. Administrative inventory responses will require
authentication and an explicit permission such as `inventory.quantity.view`.
See [API visibility](api-visibility.md).

## Authentication direction

Staff authentication uses a same-origin Next.js BFF and database-backed opaque
sessions. The browser receives only a host-only, HttpOnly, SameSite=Lax cookie;
production requires HTTPS, `Secure`, and a `__Host-` cookie name. Only a SHA-256
token hash is stored. Unsafe requests require the exact admin Origin and auth
POSTs require JSON. Protected admin Server Components validate the session
with the API before rendering. See [Staff authentication](authentication.md).

This establishes staff identity and works with the permission layer below.
Customer authentication remains separate and unimplemented, and future guest
requests cannot require an account.

## RBAC direction

The implemented authorization chain is `OriginGuard -> StaffAuthGuard -> PermissionGuard`. Controllers declare explicit requirements with `@RequirePermissions('permission.key')`. The authenticated principal is derived from live database joins, and mutation transactions repeat actor authorization before writing. Public controllers remain explicitly marked and never expose RBAC administration data.

The shared `packages/rbac` package owns the runtime-free permission catalogue, four system-role definitions, and default mappings. `packages/types` owns safe response shapes; `packages/validation` owns strict assignment payload validation. Prisma remains isolated behind the database/API boundaries.

Authorization is permission-based and deny-by-default. Roles are editable
permission bundles implemented through User, Role, Permission, UserRole, and
RolePermission. Backend guards evaluate permissions instead of scattered role
name comparisons. Customer ownership checks are separate from staff RBAC.

## Future inventory architecture

Products describe rentable offerings; inventory describes internal operational
capacity. The future model will support:

- Bulk inventory tracked by quantity.
- Serialized assets with individual identity, condition, and maintenance history.
- Append-only inventory transactions for adjustments and state changes.
- Separate reservations linked to the appropriate confirmed workflow stage.

Inventory changes that span multiple records will use database transactions.
Public applications never access this operational model directly.

## Future date-based availability

Availability is calculated for a rental period, not from a single current
quantity. Rental periods will use UTC PostgreSQL `timestamptz` values and a
documented half-open interval `[startAt, endAt)`. Active reservations and
non-rentable states affect internal availability.

An overlap query alone does not prevent concurrent double-booking. Serialized
assets may use PostgreSQL range exclusion constraints. Bulk inventory will
require a stable lock/advisory-lock or serializable transaction strategy,
capacity recalculation, and retry handling. The exact design will be reviewed
before implementation.

## Local development architecture

Docker Compose runs PostgreSQL on port 5432 with a named volume and health
check. Applications run directly through pnpm:

- Web: 3000
- Admin: 3001
- API: 4000

A root `.env`, copied from `.env.example`, supplies development-only database
and API settings. Prisma and NestJS load this file explicitly rather than
depending on the shell's current directory.

Redis is not present. Phase 2 sessions are authoritative in PostgreSQL, and
the initial single-process login limiter does not yet justify Redis. A shared
limiter store becomes relevant before horizontal scaling.

## Staging direction

Important changes move from local verification to an isolated staging
environment. Staging uses separate credentials, database storage, domains, and
configuration. Migrations are tested there before production. Staging must not
reuse local or production secrets.

## VPS production direction

The expected direction is containerized services behind an HTTPS reverse proxy
on a VPS, with separate public, admin, and API domains. Production planning must
cover managed secrets, backups and restore tests, migration deployment,
monitoring, structured logs, health checks, least-privilege networking, and
rollback procedures before launch.

## Testing strategy

Each vertical slice will add unit, integration, API, permission, and end-to-end
tests proportional to its risk. Phase 2 adds password/session unit tests,
NestJS HTTP integration tests, admin BFF and protected-rendering tests, generic
error and disabled-user tests, types, linting, formatting, builds, migration
verification, and runtime login/logout smoke tests.

Future contract tests will recursively assert that forbidden inventory keys are
absent from all public and customer responses. Permission tests will verify 401,
403, and authorized success paths.

## Security strategy

- Validate all external input and server environment values.
- Enforce authentication and permission checks in the API.
- Return allowlisted DTOs and select only required database fields.
- Keep secrets out of source, client bundles, logs, and health responses.
- Restrict CORS and sanitize production errors.
- Rate-limit sensitive public endpoints when those endpoints exist.
- Treat uploads as untrusted when file handling is introduced.
- Create audit records for sensitive administrative and inventory operations.
- Apply least privilege to users, services, networks, and database access.
