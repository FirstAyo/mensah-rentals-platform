# Products and Categories

Phase 4 implements descriptive catalogue data only. `Category` organizes `Product`; ordered `ProductImage` and `ProductSpecification` records hold media metadata and public specifications. Products have stable globally unique slugs, a category, short and long descriptions, a descriptive rental unit, active and featured flags, and timestamps. No price, quantity, availability, reservation, or inventory state exists in these models.

Public URLs are `/rentals`, `/rentals/{categorySlug}`, and `/rentals/{categorySlug}/{productSlug}`. Slugs are lowercase ASCII words separated by single hyphens. They are set at creation, are not silently regenerated when a name changes, and remain reserved after deactivation.

Administrative create/update operations validate strict shared Zod contracts. Product images and specifications are replacement arrays on update; their order is derived from array order. A product with images must have exactly one primary image. PostgreSQL enforces unique ordered positions and at most one primary image.

`DELETE` administrative routes deactivate records; rows are not physically deleted. Reactivation is explicit. A category cannot be deactivated while it contains active products, and an active product cannot be created, moved, or reactivated beneath an inactive category. A shared transaction lock serializes these transitions.

The local-only `pnpm catalogue:seed` command creates two categories and two descriptive sample products by stable slug. It never changes, reactivates, reassigns, or deletes existing records and refuses non-development environments. It creates no inventory or pricing data.

Images are metadata references only. This phase accepts managed `/media/` paths or HTTPS URLs but implements no upload pipeline. The public UI optimizes managed local paths and uses a stable placeholder for other URLs until an approved production media host and strict Next.js allowlist are configured.
