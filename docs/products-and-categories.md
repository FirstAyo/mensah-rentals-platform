# Products and Categories

Phase 4 implements descriptive catalogue data only. `Category` organizes `Product`; ordered `ProductImage` and `ProductSpecification` records hold media metadata and public specifications. Products have stable globally unique slugs, a category, short and long descriptions, a descriptive rental unit, active and featured flags, and timestamps. No price, quantity, availability, reservation, or inventory state exists in these models.

Public URLs are `/rentals`, `/rentals/{categorySlug}`, and `/rentals/{categorySlug}/{productSlug}`. Slugs are lowercase ASCII words separated by single hyphens. They are set at creation, are not silently regenerated when a name changes, and remain reserved after deactivation.

Administrative product create/update operations validate strict shared Zod metadata contracts. Specifications are replaced in their documented order. Product metadata payloads cannot associate or remove images: uploads, alt-text/primary changes, ordering, and removal are exclusive to the separately authorized media endpoints and authoritative Sharp pipeline. This prevents arbitrary URLs and metadata edits from bypassing image validation. PostgreSQL enforces unique ordered positions and at most one primary image.

`DELETE` administrative routes deactivate records; rows are not physically deleted. Reactivation is explicit. A category cannot be deactivated while it contains active products, and an active product cannot be created, moved, or reactivated beneath an inactive category. A shared transaction lock serializes these transitions.

The local-only `pnpm catalogue:seed` command creates two categories and two descriptive sample products by stable slug. It never changes, reactivates, reassigns, or deletes existing records and refuses non-development environments. It creates no inventory or pricing data.

Product edit pages upload at most four JPEG, PNG, or WebP images. The browser validates the 10 MB source limit, preserves aspect ratio, avoids enlargement, resizes to a maximum 2400-pixel longest side, and attempts WebP compression at reasonable qualities. The API independently inspects content with Sharp, applies EXIF orientation, strips unnecessary metadata, enforces dimensions and the 2 MB processed limit, and stores only normalized WebP assets. Browser processing is an optimization; server validation is authoritative.

Development files live under the ignored `MEDIA_STORAGE_ROOT` and are exposed only through content-hash `/media/products/...` URLs. Internal disk paths never enter API responses. Web and admin applications proxy those public media paths to the API. Production should replace local disk with durable object storage while preserving the public URL/storage abstraction.
