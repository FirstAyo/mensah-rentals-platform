# Category discovery and rich product content

Phase 19.2.4 adds a customer-safe visual discovery layer without changing the rental workflow, pricing rules, or inventory confidentiality boundary.

## Category showcases

The Homepage places a user-controlled Category Showcase directly below the Hero. `/rentals` uses the same presentation with a fresh server-side shuffled category order for each request. The order is finalized before hydration and never changes the independently paginated Product list.

Each card contains only active public Categories and up to four images drawn in this order: a configured Homepage/category override, the Category cover, active Product images from that Category, then neutral fallback artwork. Cards contain no price, availability, owned quantity, reservation, or staff data. Previous and Next controls wrap without cloned semantic content; touch devices retain horizontal scroll and scroll snap.

Public Product listing defaults to `Product.createdAt DESC, Product.id DESC`. Explicit Featured and alphabetical sorts remain available.

## Category presentation

`CategoryCover` remains the authoritative banner. `CategorySupportingVisual` stores zero to four ordered references to existing managed Homepage media or active Product images from the same Category. Each assignment records focal position and either meaningful alt text or explicit decorative semantics. Mutations require both `category.update` and `homepage.media.manage`.

The public Category detail DTO returns only name, slug, introduction, resolved banner, and supporting visuals. It never returns internal IDs, hashes, file-system paths, inventory, pricing, or staff data. Missing presentation media falls back to an active Product image and then the existing neutral presentation.

## Product descriptions

`Product.descriptionDocument` is nullable JSON and additive. Existing `Product.description` values are not migrated or overwritten. Legacy Products render the original plain description. When staff save rich content, the API validates a strict document allowlist and derives the plain `description` used for search and SEO.

Allowed content is paragraph, H2, H3, bold, italic, bullet list, ordered list, blockquote, hard break, and safe links. H1, raw HTML, scripts, inline styling, unknown nodes or attributes, and unsafe protocols are rejected. The website renders typed React elements rather than raw HTML. Product metadata and JSON-LD use plain text and continue to omit Offer, price, availability, and inventory.

## Brand assets

The public and Admin shells use the supplied matched logo lockups: screenshot `024421` for light surfaces and `024445` for dark surfaces. Standalone screenshots `024431` and `024456` provide the symbol. `scripts/prepare-brand-assets.mjs` removes only the uniform screenshot canvas and preserves the approved black/white artwork; it does not redraw or recolor it. Public icons and the manifest use derived sizes of that supplied symbol.

## Migration and rollback

Migration `20261004120000_phase_19_2_4_category_discovery` only adds nullable/defaulted columns, a supporting-visual table, checks, foreign keys, and indexes. It deletes or rewrites no Product, Category, description, media, Homepage, Gallery, inventory, quote, order, or customer data. Application rollback can deploy the prior version while leaving these additive objects in place; do not manually reverse the migration on a populated environment.

## Focused verification

From Windows PowerShell at the repository root, run:

```powershell
pnpm test:e2e:category-showcase
pnpm test:e2e:category-presentation
pnpm test:e2e:rich-product-editor
pnpm test:e2e:product-detail-responsive
pnpm test:e2e:branding-assets
pnpm test:e2e:phase19-2-4
```

The combined command uses only the guarded local test database, creates temporary Playwright screenshots under ignored test output, and must never point at staging or production.
