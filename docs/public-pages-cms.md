# Public pages CMS

Phase 18.6.1 gives About, Contact, Terms, and Privacy a shared managed-content workflow without merging them into the homepage aggregate. Each page has one `PublicPage` identity and append-only `PublicPageRevision` records. A page points to its current draft and published revision; published rendering never reads the draft pointer.

## Admin workflow

Open **Public Pages** at `http://localhost:3001/website/public-pages`. `public_pages.view` reads the dashboard, editor, previews, and history; `public_pages.edit` saves structured drafts and uploads normalized media; `public_pages.publish` publishes the current draft or restores an older published revision as a new immutable revision. ADMIN, EDITOR, and SUPER_ADMIN receive these permissions by default. SALES_PERSON receives none.

Draft saves, publication, and restore require an operation UUID and the current lock version. The API uses a page advisory lock plus a serializable transaction. A stale lock returns 409, the same operation/payload is idempotent, and reuse with another payload is rejected. Each mutation creates a safe `PlatformAuditEvent`. Revisions and their media placements are protected against update/delete by database triggers.

The editor exposes page-specific structured fields, visibility controls, ordered collections, SEO/social fields, image selection, alternative text, and focal position. It does not accept raw HTML. Internal CTA links are allowlisted by validation. Preview is staff-authenticated, `no-store`, and `noindex`; it never changes the published page.

## Managed media

Page media reuses normalized `HomepageMedia` files and eligible active `ProductImage` records by reference. Uploads use the existing server-side Sharp validation/normalization and storage rules. A published page placement makes a referenced managed image publicly readable; an unpublished image remains available only through a protected Admin media endpoint. Deleting shared media is blocked whenever page history references it.

## Public rendering and confidentiality

Public routes are `/about`, `/contact`, `/terms`, and `/privacy`. `GET /public/pages/:key` returns an explicit key-specific projection containing published content, resolved public image URLs, safe SEO fields, and publication time. It never serializes raw Prisma records or returns media IDs, storage paths, draft data, staff identities, operation IDs, payload hashes, audit data, permissions, inventory, reservations, availability, or authentication secrets.

All four heroes use real managed images when the existing development media library is available. About uses a full editorial brand layout; Contact preserves the operational enquiry form and verified contact constants; Terms and Privacy use shorter professional image heroes, responsive table-of-contents navigation, and structured legal sections. The official eight customer-form clauses and acknowledgement remain controlled code content and are not editable in the CMS. Legal counsel-review notices are intentionally preserved.

## Bootstrap and rollback

The additive migration is `20260828190000_phase18_6_1_public_pages_cms`. On first page/API access, the service transactionally creates the initial published revisions from the approved Phase 18.6 copy and references existing managed media without copying files. If no media exists, safe visual fallbacks are used until an editor assigns media.

Rollback is application-level: restore a prior published revision from Admin. Do not reverse or delete the migration after production data exists, because revisions are immutable history.

## Local verification

```powershell
docker compose up -d postgres postgres-test
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm rbac:seed
pnpm rbac:verify
pnpm dev
```

Sign in, open Public Pages, save a draft, preview it, publish it, and confirm the public route changes only after publication. Check all four routes at 320, 375, 390, 430, 768, 1024, and 1440 pixels in both themes. Contact submission must continue to store an enquiry. Terms must still show the exact official clauses.
