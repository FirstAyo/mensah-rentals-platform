# Gallery and company-experience CMS

Phase 19.2 adds a structured, revisioned portfolio of work completed or supported by Mensah Rentals. Gallery projects are company evidence, not Product categories and not arbitrary image uploads.

## Controlled service types

Every project and Homepage service card uses one of four validated types:

| Stored type           | Public label        | Filter URL                          |
| --------------------- | ------------------- | ----------------------------------- |
| `FILM_PRODUCTION`     | Film Production     | `/gallery?type=film-production`     |
| `EVENTS_FESTIVALS`    | Events & Festivals  | `/gallery?type=events-festivals`    |
| `CORPORATE_FUNCTIONS` | Corporate Functions | `/gallery?type=corporate-functions` |
| `PRIVATE_FUNCTIONS`   | Private Functions   | `/gallery?type=private-functions`   |

These types describe uses of rental equipment; they do not replace the catalogue Category model. Public responses use friendly labels and slugs rather than database enum names.

## Data and publication model

- `GalleryProject` owns stable identity, slug, archive state, optimistic lock version, and draft/published revision pointers.
- `GalleryProjectRevision` is an immutable Draft or Published snapshot of content, service type, SEO fields, ordering, featured state, and publication metadata.
- `GalleryProjectRevisionMedia` is an append-only ordered reference to existing normalized `HomepageMedia`, with per-placement alt text and focal position.
- `HomepageFeaturedGalleryProject` snapshots the ordered project selection for one immutable Homepage revision.

Saving creates a new draft revision; publishing creates a new published revision. Earlier revisions and their media references remain immutable. Archiving removes a project from public discovery without deleting history. Slugs are validated and public uniqueness is enforced. Database constraints ensure revision heads belong to the same project.

## Admin CMS and permissions

The staff UI is under **Website → Gallery** at `/website/gallery`, with create and project-edit routes. Admin API routes are:

- `GET /admin/gallery/projects`
- `POST /admin/gallery/projects`
- `GET /admin/gallery/projects/:id`
- `POST /admin/gallery/projects/:id/drafts`
- `GET /admin/gallery/projects/:id/revisions/:revisionId/preview`
- `POST /admin/gallery/projects/:id/drafts/:revisionId/publish`
- `POST /admin/gallery/projects/:id/unpublish`
- `POST /admin/gallery/projects/:id/archive`

All routes require a staff session and the exact `gallery.view`, `gallery.edit`, `gallery.preview`, or `gallery.publish` permission. SUPER_ADMIN has every permission. ADMIN and EDITOR receive all four Gallery permissions by default; SALES_PERSON receives none. Backend enforcement is authoritative.

Unpublish is a deliberate, confirmed action protected by `gallery.publish`. It clears only the project's published head, so the project disappears from public Gallery responses, homepage Gallery selections, and sitemap generation immediately. The published revision remains immutable in history. If the project has no current draft, unpublish creates an immutable draft snapshot from the last published revision; if a newer draft already exists, that draft remains the editable head. The mutation uses optimistic locking, a caller operation ID, payload-hash conflict detection, a serializable transaction, and the append-only `GALLERY_PROJECT_UNPUBLISHED` audit event. Retrying the same operation is safe; reusing its operation ID for different input is rejected.

The editor uses managed media only. External image URLs are not accepted. A referenced media object cannot be removed while any Gallery history, Homepage history, category cover, or other protected placement still points to it.

## Public routes, DTOs, and SEO

`GET /public/gallery` returns only published, non-archived summaries and accepts the validated `type` filter. `GET /public/gallery/:slug` returns one published detail or a true 404. Public pages are `/gallery` and `/gallery/[slug]`.

Public DTOs allow only customer-facing copy, friendly service metadata, public managed-media URLs/alt/focal data, optional factual date/location, and image count. They exclude storage paths, media hashes, revision IDs, staff identities, operation/payload hashes, audit data, inventory, availability, price, roles, and permissions.

The base Gallery has unique metadata and canonical `/gallery`. Filtered query pages canonicalize to `/gallery` and are not separate indexable landing pages. Only published project detail URLs enter the sitemap. Breadcrumb JSON-LD is factual; the platform does not invent Event, offer, rating, attendance, or organizer facts.

## Public presentation

The Homepage places the four photographic service cards near the top and links each to its filter. A managed, featured Gallery carousel follows catalogue categories; it pauses for hover, keyboard focus, hidden tabs, and reduced-motion preferences, and has manual controls. The full Gallery uses stable editorial cards and project details provide an accessible keyboard-operated lightbox when multiple images exist.

The desktop Rentals navigation uses active categories and managed category/product fallback imagery in an accessible, intent-delayed mega menu. Its opaque elevated surface and category content align to the shared 1440 px public container instead of stretching across large monitors. Mobile uses a touch-friendly Rentals accordion rather than compressing or inheriting hover behavior from the desktop menu. No navigation or Gallery response exposes inventory quantities.

## Media, backup, and transfer

Gallery files use the existing normalized managed-media volume and public content-hash URLs. Database dumps alone do not contain the image bytes: database and media-volume backups must travel together and both manifests must be verified. The allowlisted public-content transfer includes Gallery projects/revisions/media references and their media files, while stripping local staff and idempotency attribution and remapping it to the selected staging operator.

## Local verification

Run the standard gates plus the focused browser flow:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:status
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:integrity
pnpm rbac:verify
pnpm seo:audit
pnpm test:e2e:gallery-homepage-launch-flow
```

Use only the guarded `_test` database for destructive browser fixtures. Manually inspect 320, 375, 390, 430, 768, 1024, and 1440 px in light and dark themes. Verify keyboard opening/closing of the mega menu and lightbox, pause controls, no horizontal overflow, no unpublished content, and zero serious/critical Axe findings.
