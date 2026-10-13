# Public-content transfer and production promotion

## Phase 19.2 allowlist

The public-content bundle now includes Gallery projects, immutable Gallery revisions, ordered managed-media references, Homepage featured-Gallery selections, and the referenced normalized media files. It carries the existing `PlatformFeatureSetting` rows, but it does **not** transfer `CustomerWorkflowSetting`; select the staging customer-submission mode explicitly after import. Local actor IDs, operation IDs, payload hashes, and audit history are stripped/remapped under the existing staging-attribution policy.

`CartEnquiry`, `CartEnquiryItem`, `OutboundEmail`, and `OutboundEmailAttempt` are explicitly excluded because they contain operational/customer communication data. Create staging test enquiries through the UI after import. Set `CART_ENQUIRY_RECIPIENT_EMAIL` in the staging environment independently; it is not public content and is never exported.

This operator workflow copies approved catalogue/CMS content and media from local development to an empty staging database, or from an accepted staging release to an empty production database. It deliberately excludes users, password/session/capability data, customers, enquiries, carts, rental requests, decisions, quotes, orders, inventory, reservations, fulfilment, returns, maintenance, audit events, and reports.

The allowlist contains non-deleted categories and products, their product images/specifications, homepage content/media and featured Gallery choices, Gallery project publication history/media references, category covers, public pages, and platform feature states. Soft-deleted local test fixtures and dependent records are excluded. Staff attribution and operation/payload identifiers are removed from the bundle. During import, content requiring attribution is assigned to one explicitly selected active target-environment `SUPER_ADMIN`.

## Safety rules

- Export accepts only a loopback, non-`_test` development PostgreSQL URL, or an explicitly confirmed staging environment with the exact 40-character source commit SHA.
- Staging import accepts only `NODE_ENV=production`, `PLATFORM_ENVIRONMENT=STAGING`, and a separate `CONTENT_IMPORT_CONFIRM_ENVIRONMENT=STAGING` confirmation.
- Production import additionally requires exact `PRODUCTION`, `PUBLIC_CONTENT_ONLY`, empty-target, feature-state, and accepted-source-commit confirmations. The manifest must identify `STAGING` and the same accepted commit as its source.
- Import requires an active target-environment `SUPER_ADMIN` and empty target content tables.
- The bundle uses an exact model allowlist and SHA-256 checks for JSON and media.
- The media archive contains only local files referenced by exported product-image and homepage-media records; unrelated or orphaned files are not copied.
- Media archives reject absolute paths, traversal paths, links, and special entries.
- Never restore the complete staging database into production. Production promotion uses only a newly generated, inspected, allowlisted staging bundle.
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

## Production promotion direction

Freeze staging CMS writers for the final export window and create verified staging database/media backups both on the VPS and off-host. Export from the exact accepted staging commit with `CONTENT_EXPORT_CONFIRM_ENVIRONMENT=STAGING` and `CONTENT_EXPORT_SOURCE_COMMIT_SHA` set to that full commit. The deployment Compose operator mounts the environment's media volume at `/workspace/storage/media`; use an explicit host transfer-directory mount for the generated bundle. Inspect and checksum the bundle before moving it.

Production must use a separate checkout, Compose project, PostgreSQL volume, media volume, secrets, and active production `SUPER_ADMIN`. Apply all migrations and seed/verify RBAC before import. The target public-content tables must be empty. Import requires `CONTENT_IMPORT_CONFIRM_ENVIRONMENT=PRODUCTION`, `CONTENT_IMPORT_CONFIRM_SCOPE=PUBLIC_CONTENT_ONLY`, `CONTENT_IMPORT_CONFIRM_EMPTY_TARGET=YES`, `CONTENT_IMPORT_CONFIRM_FEATURE_STATES=YES`, and `CONTENT_IMPORT_EXPECTED_SOURCE_COMMIT_SHA` matching the staging manifest.

The feature-state confirmation is intentional because `PlatformFeatureSetting` rows are included. `CustomerWorkflowSetting` is not included; select and verify the production customer-submission mode explicitly after import. Do not change DNS or enable indexing until production health, content/media, SMTP, privacy, SEO, and rollback checks pass.

## Imported-history policy

Catalogue records retain their identifiers and current state. Homepage and public-page revision content is retained, but local staff attribution, idempotency operation IDs, and payload hashes are intentionally removed. Staging attribution points to the selected staging super administrator. Operational/audit history is not transferred.

After import, verify public catalogue routes, product images, Homepage services/featured Gallery, Gallery listing/filter/detail/media, About/Contact/Terms/Privacy pages, feature/customer-submission state, admin catalogue/Gallery CMS pages, and both light/dark themes. Create new staging Cart enquiries, Rental Requests, quotes, orders, reservations, fulfilment, returns, and maintenance records through the normal interfaces.
