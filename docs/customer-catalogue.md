# Customer Website and Catalogue Expansion

Phase 6 turns the public foundation into a responsive, professional catalogue while preserving the rental-request model. It does not add a cart, online request submission, pricing, reservations, or customer authentication.

## Public experience

The public routes remain `/`, `/rentals`, `/rentals/{categorySlug}`, and `/rentals/{categorySlug}/{productSlug}`. The home page explains the reviewed request and custom-quote workflow, presents active categories and catalogue highlights, and does not invent company facts, prices, or availability claims.

Catalogue lists support server-side descriptive search, featured-only filtering, semantic sorting, and 12-item numbered pagination. Category selection uses canonical slug routes instead of duplicate category query URLs. Changing a filter resets pagination. Invalid website query values are normalized; the API independently rejects unknown, administrative, or out-of-bound public fields.

Public sorts are `featured`, `name-asc`, `name-desc`, and `newest`. Search covers product name, short/long descriptions, and category name. Offset pagination is appropriate for the current scale; PostgreSQL full-text or trigram indexing should be evaluated only when measured growth requires it.

## Media and related products

List responses carry at most one display image. Product details carry at most four ordered, normalized public images. The accessible gallery keeps a stable aspect ratio, supports keyboard-operable thumbnails with selected state, uses descriptive alt text, and falls back safely when no managed image can be displayed. Only `/media/products/...` URLs are accepted by the public website boundary.

Related products are a bounded list of up to four active products in the same active category. The current product is excluded and ordering is deterministic. Related results never use inventory or date availability.

## Public contract and confidentiality

Public controllers use dedicated query schemas and Prisma projections rather than administrative schemas or selections. Runtime website assertions require exact allowlisted category, product, image, specification, pagination, and related-product keys. They reject inventory, quantity, stock, availability, asset, serial, transaction, internal staff, authentication, and RBAC aliases recursively.

Active categories remain visible even when temporarily empty. Inactive categories and products remain excluded. No public response or rendered page exposes equipment counts, asset identity, reservations, internal availability, or automatic prices.

## Accessibility and responsive behavior

The public shell includes a keyboard skip link, visible focus states, semantic navigation, reduced-motion handling, responsive full-width sections, and semantic theme foreground tokens. Catalogue filters have labels, pagination exposes the current page and disabled boundaries, loading is announced with `aria-busy`, and empty/error states remain actionable.

Playwright and axe cover 320, 390, 768, 1024, 1440, and 1920-pixel viewports. Browser checks cover reflow, serious/critical WCAG violations, keyboard access, combined filter URLs, theme persistence, product media semantics, and public confidentiality wording.

## SEO query policy

Unfiltered paginated catalogue pages self-canonicalize with their page number. Search, featured, and sort variants are `noindex,follow` and canonicalize to the clean catalogue or category route. Query variants never enter the sitemap. Product social metadata uses the primary managed image when one exists. Structured product data remains descriptive and contains no Offer, price, availability, rating, or review.
