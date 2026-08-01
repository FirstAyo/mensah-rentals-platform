# Homepage Content Management

## Phase 16.4A media assignment and editor corrections

Each image field now owns an inline media control. **Choose image** opens an accessible library of reusable homepage media and eligible active product images; search is server-side and bounded. **Upload new image** normalizes a new homepage-owned file but does not silently assign it. Staff must choose **Use this image**, after which the editor shows both the selected thumbnail/source and a section-specific confirmation. Removing an assignment removes only the placement—never the source file.

Hero slides use semantic placement keys (`hero.0.desktop`, `hero.0.mobile`, and so on), so saving and publishing preserve as many as three ordered slides. Disabled slides remain in the immutable revision but are excluded from public output. Mobile media is optional and falls back to desktop. The public carousel loads only the applicable first-slide source eagerly, stages the applicable later viewport sources, and enables navigation to each slide only after its image is ready. It pauses for hover, focus, hidden tabs, reduced motion, or the pause control, and exposes previous/next/indicator/play controls only when multiple enabled images exist. Overlay intensity is limited to Light, Medium, or Strong; Strong is the default and there is no unsafe zero-overlay option.

Featured category imagery resolves in this order: immutable homepage override, current valid category cover, deterministic first eligible active product image, then neutral artwork. A product-image cover becomes unavailable if its product is moved to another category, deactivated, or tombstoned; the assignment remains preserved while resolution advances safely to the next fallback. Category edit pages can assign a cover from homepage or same-category product media, set alt text and focal position, replace it, or remove only the assignment. Admin badges state the resolved source. Existing product media remains owned and ordered by `ProductImage`; reuse creates a reference and no duplicate file.

The desktop admin sidebar is fixed at the left edge with independent navigation scrolling. Mobile uses an accessible modal navigation menu with focus restoration. Top and bottom action bars share the same dirty, busy, permission, draft, and stale-version state. Single-line controls use a consistent 44-pixel height; standard textareas begin at 104 pixels and remain vertically resizable. A `homepage.view`-only staff member sees read-only fields and no edit, upload, preview, or publish controls unless separately permitted.

Phase 16.4 adds a secure homepage editor at `http://localhost:3001/website/homepage` and a premium public homepage at `http://localhost:3000/`.

## Content lifecycle

Homepage content uses immutable snapshots. An authorized editor saves a complete `DRAFT` revision. Secure preview reads that exact revision through the staff-authenticated admin application with private/no-store and noindex controls. Publishing copies the draft into a new immutable `PUBLISHED` revision and atomically switches the single public pointer. Restore similarly copies a historical publication into a new published revision; it never overwrites history.

Every save, publish, restore, media upload, and media removal records append-only activity. Draft save, publish, and restore use an expected lock version, UUID operation ID, payload hash, PostgreSQL transaction, and advisory lock to prevent stale or duplicate writes. Media uploads deduplicate normalized files by content hash under a database lock; media removal is a permission-checked explicit action and a retry after successful deletion returns not found. The bundled default homepage is the safe public fallback until the first publication. Draft content never enters the public endpoint.

## Editable content

The strict shared Zod contract covers SEO, hero copy and calls to action, up to three hero slides, trust items, featured-category copy, benefits, featured-product copy, the four-step process, solutions, Google review links, pickup/delivery content, service areas, and the final call to action. Inputs are bounded plain text; HTML and unsafe URLs are rejected.

Featured categories and products are relationships, not copied catalogue records. Selecting them does not change slugs, descriptions, images, inventory, or rental workflows. Only active, non-deleted records can be saved or published. If a selected record is later inactive or tombstoned, the public mapper omits it while history remains intact.

## Homepage media

Homepage media is separate from `ProductImage` and lives under `storage/media/homepage`. The API uses content inspection, EXIF rotation, metadata stripping, resizing without enlargement, WebP encoding, a 2400-pixel maximum dimension, and a 2 MB processed limit. Public responses contain only managed `/media/homepage/...` URLs, never media database IDs or filesystem paths. The public media controller serves an image only while it is referenced by the current published revision. Draft and unattached media is available only through the authenticated, private admin media route so secure preview works without making draft assets public.

An image referenced by any immutable revision cannot be deleted. An unattached image may be deleted after the database commit. Product-media files are never moved, rewritten, or cleaned up by homepage operations.

## Permissions

- `homepage.view`
- `homepage.edit`
- `homepage.publish`
- `homepage.media.manage`
- `homepage.preview`
- `homepage.google_reviews.view_status`

SUPER_ADMIN, ADMIN, and EDITOR receive these defaults. SALES_PERSON receives none. Backend authorization is authoritative.

## Public safety and preservation

`GET /public/homepage` exposes published copy, active public-safe catalogue summaries, allowlisted managed media URLs, and public Google links only. It is parsed by an exact shared public schema, so unknown fields fail closed. It excludes media IDs, database IDs, drafts, actors, activities, revision pointers, RBAC, inventory, availability, reservations, operations, hashes, secrets, Place IDs, and storage paths. Homepage mutation services also re-check that the current actor is active and still has the required permission inside the database transaction.

The bundled fallback makes no unsupported geographic promise. Its service-area copy states that service location is confirmed during request review. Staff may publish accurate service-area content once the business has confirmed it.

Migration `20260731140000_phase16_4_homepage_content` creates only new homepage objects and foreign keys. It contains no catalogue update/delete, inventory mutation, media rewrite, or destructive statement.

Migration `20260801100000_phase16_4a_media_selection` is additive. It adds dual-source placement references, immutable per-revision featured-category overrides, and the one-to-one `CategoryCover` assignment. Restrictive media foreign keys prevent physical deletion while referenced; the migration does not update or delete existing catalogue, media, homepage revision, inventory, or rental records.
