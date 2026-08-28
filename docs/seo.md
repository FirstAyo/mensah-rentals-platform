# Public SEO and Indexability

## Production origin

`https://mensahrentals.com` is the authoritative public origin. Canonicals, Open Graph URLs, sitemap entries, and JSON-LD URLs use the HTTPS non-www host. `SITE_URL` controls SEO-visible URLs; `WEB_ORIGIN` remains a separate runtime/CORS setting. When `SITE_INDEXING_ENABLED=true`, startup fails unless `SITE_URL` is exactly `https://mensahrentals.com`. Local development uses `SITE_URL=http://localhost:3000` with indexing disabled.

Phase 19 must enforce permanent HTTP-to-HTTPS and www-to-non-www redirects at the reverse proxy. Phase 18.4 does not add production redirects or deploy anything.

## Metadata and canonical policy

The homepage uses the current published CMS title, description, and approved social image, with a complete safe fallback. `/rentals`, each active category, every active product, `/privacy`, and `/terms` have a title, description, canonical, Open Graph metadata, Twitter metadata, and an index/follow decision. Product titles combine product and category identity; descriptions combine product, category, and the public short description so active catalogue metadata remains distinguishable without changing product records.

Canonical paths have no trailing slash except the root, matching current Next.js behavior. Search, sort, featured, view, and pagination query variants canonicalize to the clean catalogue/category URL and use `noindex,follow`. Query variants never enter the sitemap. Missing, inactive, tombstoned, or category-mismatched catalogue routes call `notFound()` and return a genuine 404 rather than a soft 200.

## Structured data

The homepage server-renders factual `Organization` and `WebSite` JSON-LD. Organization data currently contains only the legal business name and authoritative website URL because available address sources conflict. `LocalBusiness`, address, opening hours, coordinates, social profiles, founding details, and logo are omitted until confirmed.

Category and product pages expose visible and JSON-LD breadcrumbs. Product pages may expose name, public descriptions, category, public managed images, brand reference, and canonical URL. Product schema deliberately omits `Offer`, price, currency, public availability, inventory quantities, internal IDs/SKUs, ratings, and reviews. The request-and-quote model does not have authoritative public pricing. Google review content does not produce `AggregateRating` markup because compliance and entity-level eligibility have not been established.

JSON-LD is constructed from explicit customer-safe DTOs, serialized with `JSON.stringify`, and escapes `<` before server insertion. Tests parse it and reject commerce, inventory, authentication, capability, and staff fields.

## Sitemap and robots

`/sitemap.xml` contains only `/`, `/rentals`, `/about`, `/contact`, `/privacy`, `/terms`, active categories, and active products whose category is also active. Entries are absolute, query-free, canonical, and de-duplicated. Inactive and tombstoned catalogue entries, APIs, Admin, cart/request flows, capabilities, quotes, orders, and customer documents are excluded. `lastModified` is omitted because the public DTO does not currently expose a semantically authoritative publication timestamp; the system never invents freshness.

With indexing enabled, `/robots.txt` allows public content, advertises `https://mensahrentals.com/sitemap.xml`, and disallows known operational prefixes. It does not block `/rentals` or public media. With indexing disabled, it disallows all crawling. Robots rules are crawler guidance, never authorization.

## Private routes and documents

Cart, rental-request, request tracking/results/amendments, change requests, quote access, order access, and web BFF routes use `noindex,nofollow`. Next.js response headers add defense in depth with `X-Robots-Tag: noindex, nofollow, noarchive` and `Referrer-Policy: no-referrer`. Private JSON/proxy responses also use `Cache-Control: private, no-store` where state is returned.

Official Order Forms, Return Forms, quote documents, and capability downloads remain authorization protected, absent from the sitemap, non-static, private/no-store, and protected with `X-Robots-Tag`. This phase does not change PDF content. Capability tokens never belong in canonicals, metadata, JSON-LD, analytics labels, or sitemap URLs.

## Images and performance

Admin-authored product alt text is used for informative product imagery; decorative hero/category backgrounds remain hidden from assistive technology. Product pages prefer the primary managed public image for social metadata and use a safe no-image fallback. Internal filesystem paths never appear publicly.

Only the initial hero image is eager and high priority. The browser preloads the next slide on demand instead of preloading every slide shortly after page load. Existing dimensions, overlays, crossfade, controls, CMS behavior, and reduced-motion behavior remain unchanged. Product grids and galleries retain stable aspect ratios, responsive sizes, and lazy loading for non-primary media.

## Geographic and NAP policy

Regional terms may be used only where published business content supports them; Phase 18.4 does not create thin location pages or mechanically append city names. The official PDF source and current live website show different Richmond addresses. The phone is consistent, but the address conflict must be resolved by the business before adding visible NAP or address-bearing LocalBusiness schema.

Phase 18.6 publishes the verified phone and email plus `Richmond, British Columbia`. Contact structured data uses Organization with telephone, email, and locality only. It deliberately omits the conflicting street/suite/postal details, opening hours, coordinates, and `LocalBusiness` claims.

## Local audit and browser checks

Start local PostgreSQL before the data-backed audit:

```powershell
docker compose up -d postgres postgres-test
pnpm seo:audit
pnpm test:e2e:seo
```

`pnpm seo:audit` runs focused origin, sitemap, robots, JSON-LD, injection, confidentiality, duplicate-title, duplicate-description, and canonical tests, then audits every active category and product in the development database without modifying it. `pnpm test:e2e:seo` resets only the guarded `_test` database and verifies production-origin metadata, structured data, sitemap, robots, private headers, real 404s, inactive content, responsive layouts, and serious/critical Axe findings.

## Post-deployment search-engine checklist

After Phase 19 deploys the application:

1. Verify the domain property in Google Search Console and Bing Webmaster Tools.
2. Confirm HTTP redirects to HTTPS and www redirects to the non-www host.
3. Submit `https://mensahrentals.com/sitemap.xml`.
4. Inspect homepage, catalogue, category, and product canonicals.
5. Request indexing for priority public pages only.
6. Monitor indexing coverage, crawl errors, Core Web Vitals, structured-data reports, and sitemap processing.
7. Keep private/customer URLs out of analytics dimensions and search tooling.

Analytics is a separate deployment and business decision; Phase 18.4 does not add it.

## Phase 19 redirect inventory

The existing public site uses `/about/`, `/gear/`, `/contact/`, and `/product/{slug}/`. Phase 19 must verify the final migrated destination for each real legacy URL and add explicit permanent redirects where a matching destination exists. It must also enforce HTTP-to-HTTPS and www-to-non-www redirects. Phase 18.4 deliberately does not add speculative wildcard redirects for legacy product slugs.

## Feature-control preservation

Feature settings never remove the homepage, `/rentals`, active category/product pages, legal pages, sitemap, robots, canonical metadata, or structured-data architecture. Disabled transactional routes remain noindex/noarchive and are never added to the sitemap. Public capabilities and structured data contain no feature configuration or inventory availability. Production treats Testing rental/customer flows as unavailable and non-discoverable.
