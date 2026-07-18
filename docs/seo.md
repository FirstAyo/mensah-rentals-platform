# Public SEO Foundation

The public app uses the Next.js Metadata API with `WEB_ORIGIN` as the canonical origin. `SITE_INDEXING_ENABLED=false` is the safe local/staging default. Production should use `WEB_ORIGIN=https://mensahrentals.com` and enable indexing only after launch review.

The home, rentals, category, and product pages define truthful titles, descriptions, canonical URLs, Open Graph data, and Twitter summary data where appropriate. Category and product canonicals use slugs returned by the public API. A category/product mismatch returns 404 rather than producing duplicate content.

`/sitemap.xml` contains the home page, rentals page, active categories, and active products beneath active categories. It never includes admin, login, private account, database-ID, inactive, or query-variant URLs. `/robots.txt` disallows all crawling when indexing is disabled; when enabled it allows public content, advertises the sitemap, and disallows known private prefixes. Admin metadata, `robots.txt`, and response headers all specify noindex. Robots directives are not authorization.

Structured data includes truthful BreadcrumbList data and descriptive Product data. It never contains Offer, price, currency, availability, stock, ratings, reviews, or invented organization details. JSON-LD escapes `<` before insertion. Visible breadcrumbs mirror structured breadcrumbs.

Public server fetches use `cache: no-store` in Phase 4 so deactivation is reflected immediately. A future publication cache may use tagged revalidation only after every catalogue mutation invalidates the relevant paths safely.
