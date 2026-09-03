# Public-content transfer to staging

This operator workflow copies local catalogue/CMS content and media to an empty staging database. It deliberately excludes users, password/session/capability data, customers, enquiries, carts, rental requests, decisions, quotes, orders, inventory, reservations, fulfilment, returns, maintenance, audit events, and reports.

The allowlist contains non-deleted categories and products, their product images/specifications, homepage content/media, category covers, public pages, and platform feature states. Soft-deleted local test fixtures and dependent records are excluded. Staff attribution and operation/payload identifiers are removed from the bundle. During import, content requiring attribution is assigned to one explicitly selected active staging `SUPER_ADMIN`.

## Safety rules

- Export accepts only a loopback, non-`_test` development PostgreSQL URL.
- Import accepts only `NODE_ENV=production`, `PLATFORM_ENVIRONMENT=STAGING`, and a separate `CONTENT_IMPORT_CONFIRM_ENVIRONMENT=STAGING` confirmation.
- Import requires an active staging `SUPER_ADMIN` and empty target content tables.
- The bundle uses an exact model allowlist and SHA-256 checks for JSON and media.
- The media archive contains only local files referenced by exported product-image and homepage-media records; unrelated or orphaned files are not copied.
- Media archives reject absolute paths, traversal paths, links, and special entries.
- Never use this workflow for production promotion.
- Never send a bundle through Git; `.local-transfers/` is ignored.

## Local export

Stop local application writers, start Docker Desktop and the development PostgreSQL service, and verify database integrity:

```powershell
docker compose up -d postgres
pnpm db:status
pnpm db:integrity
pnpm content:export
```

The command prints a new ignored `.local-transfers/<timestamp>-public-content` directory. Inspect it before transfer:

```powershell
pnpm content:inspect -- --bundle=.local-transfers/<timestamp>-public-content
git status --short
```

The directory contains `content.json`, `media.tar.gz`, and `manifest.json`. Do not manually edit them after hashes are generated.

## Staging import direction

The current staging public-content tables must be empty. If staging has only bootstrap/default test content, first preserve an exact staging dump and media archive, stop application writers, and reset only the confirmed staging database. Reapply migrations, RBAC, and the first staging operator before importing. This destructive staging reset requires an explicit operator checkpoint; do not copy these steps to production.

Transfer the directory over SSH into an operator-only directory, inspect it inside the migration image, and provide the staging operator email through a temporary environment variable. Mount the transfer directory read-only. After the guarded database import, normalize the media-volume ownership, extract the verified archive as the API user, and run exact media hash verification with the volume mounted read-only.

The deployment operator should follow the command sequence supplied for the specific staging bundle and recorded rollback dump. Do not guess volume names or database names.

## Imported-history policy

Catalogue records retain their identifiers and current state. Homepage and public-page revision content is retained, but local staff attribution, idempotency operation IDs, and payload hashes are intentionally removed. Staging attribution points to the selected staging super administrator. Operational/audit history is not transferred.

After import, verify public catalogue routes, product images, homepage sections, About/Contact/Terms/Privacy pages, feature states, admin catalogue/CMS pages, and both light/dark themes. Create new staging rental requests, quotes, orders, reservations, fulfilment, returns, and maintenance records through the normal interfaces.
