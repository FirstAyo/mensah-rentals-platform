# Mensah Rentals Platform

Mensah Rentals Platform is the new digital foundation for Mensah Rentals &
Services. It will support equipment rental requests for events, film
productions, and other projects.

This is a **rental-request platform**, not an automatic-price e-commerce
checkout. Customers will request equipment and quantities without seeing
internal availability or an automatically calculated final price. Authorized
staff will review each request and prepare a custom quote in a later phase.

Phase 3 adds secure internal staff authentication, permission-based RBAC,
protected role administration APIs, and a permission-aware development shell.
It does not contain customer authentication or rental business features. Future
guest rental requests will not require an account.

Phase 4 adds product/category data, protected management APIs and admin pages,
public-safe catalogue APIs and slug routes, a secure optimized image pipeline,
shared light/dark theming, and the technical SEO foundation.

Phase 5 adds confidential bulk and serialized inventory, append-only
operational history, permission-separated administrative APIs, and an inventory
admin foundation. Phase 7 adds the anonymous rental cart. Phase 8 adds secure
guest request submission and private customer-safe tracking while still creating
no reservation, availability promise, automatic price, quote, or order.

Phase 8.1 hardens the completed foundations with public-cart throttling,
bounded expired-access cleanup, an isolated disposable integration-test
database, recursive public-data regression checks, and partitioned Playwright
suites. It does not begin staff request review or any approval workflow.

Phase 9 adds the protected administrative rental-request queue, assignment,
append-only internal notes and activity, and the `SUBMITTED -> UNDER_REVIEW`
transition. Internal inventory totals are permission gated and clearly remain
current operational context—not a date-based availability guarantee. This
phase creates no decision, approved quantity, quote, order, reservation, or
inventory mutation.

Phase 10 adds immutable approval, partial-approval, and rejection decisions.
Phase 11 adds custom staff-priced quotes derived from approved decision
quantities, immutable revisions, exact integer-cent totals, secure customer
access, and accept/reject responses. A quote is not a confirmed order and does
not reserve or mutate inventory.

## Architecture

This pnpm and Turborepo monorepo contains:

- `apps/web` — public customer website, port 3000.
- `apps/admin` — internal administration application, port 3001.
- `apps/api` — NestJS REST API and the only application allowed to access the database, port 4000.
- `packages/database` — Prisma schema, generated client, and database boundary.
- `packages/auth` — server-side password and opaque-session cryptography.
- `packages/rbac` — shared permission catalogue and default role mappings.
- `packages/ui` — narrowly shared React UI primitives.
- `packages/types` — runtime-free shared TypeScript contracts.
- `packages/validation` — shared Zod validation schemas.
- `packages/config` — shared build-time TypeScript conventions.

PostgreSQL runs locally in Docker. Redis is intentionally deferred until a
concrete requirement exists.

## Prerequisites

- Windows 10 or 11
- Node.js 22 LTS or newer compatible LTS release
- Corepack and pnpm 10.15.1
- Git
- Docker Desktop using Linux containers/WSL 2

See [Local development](docs/local-development.md) for beginner-friendly
installation and troubleshooting steps.

## Quick start

Run these commands in PowerShell from the repository root:

```powershell
corepack enable
corepack prepare pnpm@10.15.1 --activate
Copy-Item .env.example .env
```

Open the new, Git-ignored `.env` and fill in the four
`STAFF_BOOTSTRAP_*` values with your own local email, name, and password. Do not
put the password in `.env.example`. Then continue:

```powershell
pnpm install
docker compose up -d postgres
docker compose ps
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm rbac:seed
pnpm staff:bootstrap
pnpm rbac:verify
pnpm catalogue:seed
pnpm dev
```

Then open:

- Customer website: http://localhost:3000
- Public rentals: http://localhost:3000/rentals
- Guest rental request: http://localhost:3000/rental-request
- Private request tracking: http://localhost:3000/track-request
- Admin staff login: http://localhost:3001/login
- Admin rental-request queue: http://localhost:3001/rental-requests
- Admin quotes: http://localhost:3001/quotes
- Private customer quote: http://localhost:3000/quote (valid capability required)
- API liveness: http://localhost:4000/health
- PostgreSQL readiness: http://localhost:4000/health/database

## Common commands

```powershell
pnpm dev          # Start all applications
pnpm dev:web      # Start only the customer website
pnpm dev:admin    # Start only the admin dashboard
pnpm dev:api      # Start only the API
pnpm build        # Create production builds
pnpm lint         # Run ESLint
pnpm typecheck    # Run TypeScript checks
pnpm test         # Run unit tests
pnpm format:check # Check formatting
pnpm staff:bootstrap # Idempotently create the local development staff user
pnpm rbac:seed       # Idempotently seed roles, permissions, and defaults
pnpm rbac:verify     # Verify seed, uniqueness, and bootstrap SUPER_ADMIN
pnpm catalogue:seed  # Create missing development-only catalogue samples
pnpm cleanup:expired:dry-run # Preview bounded expired access cleanup
pnpm cleanup:expired         # Remove bounded expired access records
pnpm test:e2e:smoke          # Verify all local services are ready
pnpm test:e2e:catalogue      # Catalogue browser checks
pnpm test:e2e:cart           # Guest-cart browser checks
pnpm test:e2e:requests       # Guest-request browser checks
pnpm test:e2e:admin          # Admin login/protection browser checks
pnpm test:e2e:admin-requests # Authenticated Phase 9 review browser checks
pnpm test:e2e:admin-decisions # Isolated approval/partial/rejection checks
pnpm test:e2e:admin-decisions:approve # Isolated full-approval check
pnpm test:e2e:admin-decisions:partial # Isolated partial-approval check
pnpm test:e2e:admin-decisions:reject  # Isolated rejection check
pnpm test:e2e:admin-quotes     # Isolated quote creation/send checks
pnpm test:e2e:customer-quotes  # Isolated private customer quote checks
pnpm test:e2e:quotes           # Both quote browser suites in one reset
```

`pnpm test` includes database-backed integration tests. It automatically uses
and resets only the local database named by `TEST_DATABASE_URL`; the guarded
runner refuses the development database, remote hosts, and names not ending in
`_test`.

The Phase 10 decision browser commands apply the same `_test` guard and reset
only that isolated database. Stop ordinary development servers first; the
runner refuses occupied application ports so it cannot silently decide records
through a development API.

## Documentation

- [Architecture](docs/architecture.md)
- [Staff authentication](docs/authentication.md)
- [Planned domain model](docs/domain-model.md)
- [Permissions](docs/permissions.md)
- [RBAC implementation](docs/rbac.md)
- [API data visibility](docs/api-visibility.md)
- [Roadmap](docs/roadmap.md)
- [Local development](docs/local-development.md)
- [Testing guide](docs/testing-guide.md)
- [Products and categories](docs/products-and-categories.md)
- [Theme foundation](docs/theme.md)
- [SEO foundation](docs/seo.md)
- [Customer website and catalogue](docs/customer-catalogue.md)
- [Rental cart foundation](docs/rental-cart.md)
- [Rental request foundation](docs/rental-requests.md)
- [Administrative rental-request review](docs/admin-rental-request-review.md)
- [Inventory foundation](docs/inventory.md)
- [Rental-request decisions](docs/rental-request-decisions.md)
- [Custom quotes](docs/quotes.md)

Phase 10 adds permission-separated approval, partial approval, and rejection,
immutable decision history, separate approved quantities, and customer-safe
tracking updates. Decisions create no quote, order, reservation, or inventory
mutation.

Phase 11 creates immutable custom quote revisions, secure customer access, and
accept/reject history. Confirmed orders, inventory reservations, date-based
allocation, and inventory mutation remain deferred to later phases.
