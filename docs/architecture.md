# Architecture

## Phase 17 maintenance boundary

The NestJS maintenance module is the sole maintenance and inspection authority. Work orders, inspections, append-only notes, and globally unique mutation operations are independent downstream aggregates; they never replace returns, issues, fulfilment, reservations, or inventory history. Bulk targets use serializable inventory-root locking and active-claim accounting. Serialized targets retain exact asset identity and database-enforced active-work exclusivity.

Physical movements use explicit ledger actions and maintenance-operation references. A source already in `MAINTENANCE` is claimed without a second movement; a work-order-owned ingress is the only movement cancellation may reverse. Post-maintenance inspection failure returns work to `IN_PROGRESS` while leaving equipment unavailable. Passing makes explicit completion eligible; completion performs one exact `MAINTENANCE -> RENTABLE` or `MAINTENANCE -> DAMAGED` transition.

Administrative routes require staff authentication, exact permissions, live transactional permission rechecks, private/no-store DTOs, and a fixed same-origin Next.js BFF allowlist. There is no public maintenance controller. See [Maintenance workflow](maintenance-workflow.md).

## Phase 16.4.1 server-only Google Reviews boundary

The NestJS homepage module owns `GooglePlacesReviewsService`. It uses a fixed Places API (New) endpoint, explicit field mask, strict schema, bounded body reader, timeout, safe error classifications, Google-owned HTTPS URL validation, and transient in-flight deduplication. It has no Prisma dependency and writes no Places content to PostgreSQL, Redis, files, build output, or logs.

The public homepage receives review data from `GET /public/homepage/google-reviews` in an isolated streamed Server Component with `no-store`. The stable CMS fallback is rendered immediately while the review boundary resolves. Admin diagnostics traverse a fixed same-origin BFF allowlist, then repeat authentication, active-user resolution, permission enforcement, Origin/content-type validation, and no-store response handling in the API.

## Phase 16.4A presentation-media references

Homepage media placement is a dual-source reference: exactly one of `HomepageMedia` or `ProductImage` is selected for each immutable semantic slot. This additive design reuses validated product files without inventing a risky universal media table. Restrictive foreign keys and service-level usage checks prevent source deletion; removing placement never mutates the owner. Revision copies preserve both source identity and ordered slot keys.

Category presentation is separate from catalogue identity. `CategoryCover` holds the current category-level assignment, while `HomepageFeaturedCategory` snapshots an optional per-publication override. The public mapper deterministically resolves override → cover → active product image → neutral fallback and emits an explicit safe DTO. All homepage/category mutations recheck live active-user permissions in their locked transaction. Fixed admin BFF routes enforce exact origins, content types, body limits, query allowlists, and named session-cookie forwarding.

## Phase 16.4 homepage boundary

The API owns an append-only homepage aggregate with immutable revisions, one draft pointer, one published pointer, a lock version, relational featured catalogue selections, isolated media, and activity history. Public web reads only `GET /public/homepage`; admin uses authenticated `/admin/homepage` routes with exact `homepage.*` permissions. Preview stays inside the staff application and is private/no-store/noindex. Public rendering is server-first and only the accessible hero controller hydrates. Homepage media has a separate table and filesystem namespace. Live Google review caching is absent because it conflicts with current Places policy.

## Phase 15 fulfilment boundary

The NestJS API is the sole authority for preparation, reservation consumption, physical inventory movement, handoff, and active-rental creation. A serializable transaction connects these separate aggregates without changing order/quote snapshots. Admin BFF routes are fixed allowlists; customer mapping is a separate coarse allowlist.

## Phase 14 reservation architecture

`InventoryReservation` is a separate aggregate between a confirmed order and
future checkout. The API is the sole availability authority: it reloads live
permissions and inventory, serializes bulk product/date mutations with database
locks, and relies on PostgreSQL range exclusion for serialized allocations.
Dates use UTC half-open `[start, end)` intervals. Allocation and delta history
is append-only. The admin BFF exposes only fixed reservation paths; public DTOs
and customer BFFs contain no reservation or availability data. See
[Inventory reservations](inventory-reservations.md).

## Phase 13 amendment architecture

The customer BFF has a fixed allowlist for request revision, amendment, active-catalogue, and formal change-request routes. It keeps request-scoped capabilities in HttpOnly, host-only, SameSite=Lax cookies; production requires Secure `__Host-` cookie names. The NestJS API is the capability and authorization boundary and emits only explicit customer DTOs with private/no-store behavior.

`RentalRequest.currentRevisionId` is the sole operational snapshot. Decisions target one exact revision. An atomic amendment switches that pointer, requires re-review, supersedes the old operational decision and non-accepted proposal, and preserves every historical row. Accepted quotes and confirmed orders instead receive an independent `RentalChangeRequest`. Inventory and reservation modules are not called.

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

## Phase 4 catalogue, theme, and SEO architecture

The API now owns a catalogue module with physically separate administrative and public controllers, Prisma projections, and response mappers. Administrative `/admin/categories` and `/admin/products` routes require the existing category/product permissions. Public `/public/categories` and `/public/products` routes are GET-only and select active descriptive fields; they never join a future inventory model.

The admin browser uses fixed same-origin catalogue BFF handlers. They allow only the categories/products paths, exact methods, bounded query names, and the named staff session cookie. The API repeats authentication, live permission checks, Origin checks, validation, and transactional rules.

Both Next.js apps use shared theme primitives and app-level semantic tokens. The public app uses server-only public API access, nested slug routes, no-store catalogue reads, and Next metadata/sitemap/robots mechanisms. Durable production object storage remains deferred until deployment design; local development uses the validated media pipeline described below.

The validated media pipeline now performs best-effort browser resizing/compression and authoritative Sharp inspection, rotation, metadata stripping, resizing, WebP normalization, size enforcement, and four-image enforcement. Local normalized files are behind public content-hash URLs; durable production object storage remains the deployment direction.

## Phase 5 inventory architecture

The API inventory module is administrative-only. `Inventory` uniquely identifies a product's BULK or SERIALIZED tracking mode. Bulk state balances are derived from append-only `InventoryTransaction` movements; serialized current state is projected on `InventoryItem` and changed atomically with a transaction. A transaction-scoped creation lock and per-inventory row locks serialize mutations, required operation UUIDs make retries idempotent, and database triggers reject ledger edits, cross-mode items/events, and tracking-mode changes after activity.

Metadata, quantities, adjustments, and history have separate cumulative permissions. The admin BFF allowlists inventory paths, methods, queries, Origin, content type, and the named session cookie, and marks responses private/no-store. No inventory relation is selected by public catalogue queries. Date-based reservations and rental-period availability remain deferred.

## Phase 6 customer catalogue architecture

Public catalogue controllers use public-only Zod query schemas and least-privilege Prisma projections. Public filters are descriptive only, product lists return one display image, details return at most four images plus four deterministic same-category related products, and no inventory relationship participates in public selection, filtering, or ranking.

The customer Next.js application parses allowlisted URL state, sends filters to the API for server-side execution, and keeps categories on canonical slug routes. Runtime response guards enforce exact public DTO keys and managed media URLs. Search/filter variants are noindex with clean canonicals; unfiltered pages self-canonicalize. Playwright and axe provide browser-level reflow, keyboard, theme, and accessibility verification across six viewport sizes.

## Phase 7 rental cart architecture

The implemented guest cart is server-authoritative and independent of staff or
customer authentication. PostgreSQL stores only a SHA-256 hash of a 256-bit
opaque capability; the public web host keeps the raw capability in a separate
host-only HttpOnly cookie. A fixed same-origin Next.js BFF validates exact web
Origin, JSON content type, path, and method before forwarding only that
capability to the NestJS public cart module. The API repeats Origin and input
validation and returns private, no-store, allowlisted DTOs.

`Cart` and `CartItem` represent mutable customer intent only. Absolute desired
quantity updates are transactional and constrained, but never inspect or
mutate Inventory, calculate availability, create inventory transactions, or
reserve equipment. Rental dates and request conversion are separate Phase 8 boundaries.
See [Rental cart foundation](rental-cart.md).

## Phase 8 rental request architecture

Guest submission is a new public workflow boundary, not an extension of staff
authentication. The web application collects shared-Zod validated details,
posts through a fixed same-origin BFF, and never stores contact data or access
capabilities in localStorage. The BFF forwards only the named cart and request
capabilities to the NestJS rental-request module.

The API rate-limits valid cart/request capabilities and maintains a separately
configured high global safety ceiling. It does not treat the BFF socket address
as an individual customer address. A production reverse proxy must add
per-client throttling at the trusted public edge and replace untrusted forwarded
address headers; horizontally scaled API processes require a shared limiter.

The API hashes the UUID idempotency key and authoritative source-cart
capability, locks the cart, snapshots its active public catalogue fields and
original quantities, creates `RentalRequest`/`RentalRequestItem`, and consumes
the cart in one PostgreSQL transaction. Unique constraints and a post-lock
re-read make safe retries return the existing request. Database triggers make
submitted item and request-intent fields immutable.

Private tracking combines a random readable reference with a separate expiring
guest capability. Only the capability hash is stored. Public response mappers
expose a customer-safe `REQUEST_SUBMITTED` projection and no contact, staff,
pricing, inventory, availability, or reservation data. Submission never queries
or mutates inventory. Request pages are noindex and outside the public sitemap.
See [Rental request foundation](rental-requests.md).

## Phase 8.1 hardening architecture

Public cart reads and mutations use bounded process-local rate counters. Valid
capabilities receive isolated read/mutation buckets, while tokenless,
malformed, and rotating traffic also consumes a separately configured high
global ceiling. The API never treats the shared Next.js BFF socket as one
customer. Production still requires trusted-edge per-client throttling and a
shared counter store before horizontal scaling.

Expired `StaffSession`, `Cart`, and `GuestRequestSession` records are temporary
and removable in ordered, bounded, race-safe batches. Removing an expired guest
capability sets `RentalRequest.guestSessionId` to null; the durable request and
immutable item snapshots remain. The database trigger permits only this
one-way detachment and forbids capability reassignment.

Database integration tests use a dedicated local PostgreSQL database whose
name must end in `_test`. A guarded runner refuses the development database or
remote hosts, resets only the test database, reapplies every migration and
constraint, then executes uncached tests. Append-only inventory triggers remain
enabled; normal development records are never used as test fixtures.

Playwright is partitioned into smoke, catalogue, cart, request, and admin
groups. A single global setup verifies the customer site, admin login, API,
database readiness, and seeded catalogue before browser work begins.

## Phase 9 administrative request-review architecture

Phase 9 adds an administrative-only rental-request boundary. The NestJS API
owns server-side queue search/filter/sort/pagination, internal request detail,
eligible active-staff assignment, append-only notes/activity, and the single
non-decision `SUBMITTED -> UNDER_REVIEW` transition. The admin Next.js BFF and
UI never replace API authentication, live permission checks, validation, or
transactional integrity.

`RentalRequest.reviewVersion` provides optimistic concurrency for assignment
and review-state changes. A transaction conditionally advances that version
and writes the corresponding activity, so stale staff screens cannot silently
overwrite newer work. Notes use operation IDs for safe retry handling and are
append-only. Immutable `RentalRequestItem` snapshots remain protected by the
database.

Internal inventory context is composed only for staff who hold both
`inventory.view` and `inventory.quantity.view`. It represents current ledger
state only and is labelled as not calculating requested-date conflicts. Review
reads and mutations never change Inventory, create InventoryTransaction rows,
create reservations, or allocate serialized assets.

Administrative and public response mappers remain physically separate. Public
tracking never receives assignment, staff identity, internal notes/activity,
inventory context, or internal review details. See [Administrative request
review](admin-rental-request-review.md).

## Phase 10 decision boundary

The API owns `UNDER_REVIEW -> APPROVED | PARTIALLY_APPROVED | REJECTED`. It
authorizes the exact action, rechecks live permissions inside a row-locking
transaction, stores an append-only decision with complete line snapshots,
appends activity, and advances the optimistic review version. The admin BFF
allows only fixed decision routes. Public tracking uses a separate allowlisted
mapper and never serializes administrative decision records directly. Decision
code does not mutate inventory or create quotes, orders, or reservations. See
[Rental request decisions](rental-request-decisions.md).

## Phase 11 quote architecture

The API now owns a quote aggregate composed of one `Quote` thread, immutable commercial `QuoteRevision` snapshots, separate lifecycle state, items, charges, tax, customer access, customer response, and append-only activity. `latestRevisionId` is the staff work pointer; `customerRevisionId` is the sent/customer pointer. This prevents a new draft from accidentally invalidating an existing sent proposal before the replacement is sent.

Admin mutations pass through fixed Next.js BFF allowlists and require live backend permissions both at the guard and inside the database transaction. Customer access uses a separate revision-scoped HMAC capability, hash-only persistence, fragment bootstrap, and HttpOnly cookie. Customer responses never traverse the staff-auth boundary. All private responses are no-store/noindex. Explicit public mappers and a fail-closed web parser prevent internal quote, decision, staff, RBAC, or inventory fields from crossing the public boundary.

Quote calculations are server-owned integer-cent/basis-point operations and PostgreSQL verifies stored aggregates at transaction commit. No quote code imports an order, reservation, allocation, or inventory mutation service. See [Custom quotes](quotes.md).

## Phase 12 confirmed-order architecture

An accepted quote remains separate from a confirmed order. An authorized staff
mutation locks the quote, revalidates live `order.create`, verifies the current
customer revision and response, recalculates stored money, and creates immutable
order snapshots, activity, and dedicated customer access atomically. Database
uniqueness and deferred source/total triggers back the transaction.

Admin reads and conversion use fixed same-origin BFF routes. Customer access
uses an order-specific hash-only HMAC capability, fragment bootstrap, separate
HttpOnly cookie, public mapper, and fail-closed web validator. Private responses
are no-store/noindex. The order is `CONFIRMED` and `NOT_RESERVED`; this module
has no inventory, availability, allocation, or reservation dependency. See
[Confirmed rental orders](rental-orders.md).

## Phase 12.1 workflow-hardening architecture

The admin shell is a true viewport-wide application grid: its desktop sidebar
starts at the physical left edge, while individual pages may apply their own
readability constraints. A private `GET /admin/work-summary` boundary calculates
only counts supported by current request, quote, and order records. Sections are
omitted unless the active staff principal has their required permissions. The
Rental Requests badge means `SUBMITTED` requests awaiting review—not unread
messages—and uses bounded polling plus focus/invalidation refreshes rather than
WebSockets.

Quote percentage discounts use integer basis points. Each revision snapshots
the type, pre-tax item-plus-charge base, calculated discount cents, and the
proportional taxable discount used by the server-owned tax calculation. Only
the latest `DRAFT` may change in place, under a version check and quote lock.
Sent and terminal commercial snapshots remain immutable. Resending preserves
the active revision, lifecycle, response, access identity, and expiry; explicit
rotation is the only operation that replaces a capability.

Quote and order access records are append-only history with at most one
unrevoked capability per document. Raw capabilities are reconstructed only for
an authorized mutation response and are never stored. Order conversion no
longer implicitly distributes customer access; authorized staff explicitly
generate, revoke, rotate, or prepare the active link for resend.

PDFs are generated inside the NestJS boundary from dedicated customer-safe
document projections. Staff downloads require the corresponding live view
permission; customer downloads reuse the exact existing capability resolver.
The binary BFF routes forward only the named HttpOnly capability/session,
accept only PDFs, impose a size ceiling, and return private/no-store attachment
headers. Documents contain no staff, internal notes, decisions, activities,
operations, capability material, inventory, availability, or reservations.

## Phase 16 return boundary

The return module owns return intake, reconciliation, issues, recovery, and explicit rental completion. It uses immutable command/evidence rows plus database-guarded current projections and the existing append-only inventory ledger. The first finalized return freezes the Phase 15 checkout set. All return mutations use serializable transactions, expected versions, UUID operation identity, live permissions, and a common active-rental/return lock root. Staff DTO/PDF builders are separate from the order-capability customer mapper. See [Returns and reconciliation](returns-and-reconciliation.md).

## Phase 16.2 category-retention boundary

Reversible category deactivation is separate from permanent catalogue deletion. A transaction-level catalogue lock plus product row locks protects dependency recalculation. Safe, unreferenced records are hard-deleted; historically or operationally referenced products and their category receive a private `deletedAt` tombstone. No restrictive request or inventory relationship is weakened. Product media filesystem cleanup runs only after the database transaction commits.

Phase 16.3 extends this retention boundary to direct product deletion. The product-delete transaction obtains the catalogue lock, the same per-product lock used by media mutations, and a row lock before recalculating references. Empty, unreferenced identity is hard-deleted; any immutable request reference or non-empty operational inventory graph produces a private tombstone. Product deactivation remains a separate `product.update` operation. Deletion cannot act as an inventory, reservation, fulfilment, return, or issue mutation.

## Phase 18 reporting and operations

Reporting is a read-only NestJS boundary over authoritative operational tables; it neither copies workflow state nor mutates it. Fixed admin BFF routes connect to permission-layered report, audit, and system APIs. New cross-cutting audit events are database-enforced append-only, while existing immutable histories are safely projected. Observability is permission protected. Database/media backup and isolated restore verification are operator commands, never browser actions.

# Phase 18.1 official customer PDF boundary

Customer Order and Return forms use a dedicated, dependency-free A4 renderer in the API. A narrow allowlisted projection is constructed from immutable order snapshots and lifecycle records before rendering, so commercial fields cannot enter the PDF data path. Order Form eligibility is based on the first checkout timestamp; Return Form eligibility is based on final return completion. Staff authorization and opaque customer order capabilities remain the only access paths. See [official-customer-pdfs.md](official-customer-pdfs.md).
