# Live Google Reviews integration

## Phase 16.4.1 decision

Mensah Rentals uses the current Google Places API (New) Place Details web service. The NestJS API is the only component that contacts Google. The customer browser receives a small allowlisted DTO and never receives the API key, Place ID, request headers, raw response, or diagnostic details.

The fixed upstream request is:

```text
GET https://places.googleapis.com/v1/places/{configured-place-id}
X-Goog-Api-Key: {server-only-key}
X-Goog-FieldMask: id,displayName,rating,userRatingCount,googleMapsUri,reviews
languageCode=en-CA
regionCode=CA
```

The field mask is explicit and contains no wildcard. Place Details returns at most five relevant reviews; the public mapper preserves Google's order and emits at most the first three. No rating, count, author, review copy, date, or source link is editable in the homepage CMS.

Official references:

- [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Place and Review REST fields](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places)
- [Places API policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Privacy Policy](https://policies.google.com/privacy)
- [Google Terms of Service](https://policies.google.com/terms)

## Configuration

Add these values only to the ignored root `.env`. Never use a `NEXT_PUBLIC_` variable for the key.

```text
GOOGLE_REVIEWS_LIVE_ENABLED=false
GOOGLE_PLACES_API_KEY=
GOOGLE_BUSINESS_PLACE_ID=
GOOGLE_REVIEWS_URL=
GOOGLE_WRITE_REVIEW_URL=
GOOGLE_PLACES_LANGUAGE_CODE=en-CA
GOOGLE_PLACES_REGION_CODE=CA
GOOGLE_PLACES_TIMEOUT_MS=4000
PUBLIC_GOOGLE_REVIEWS_RATE_LIMIT=120
PUBLIC_GOOGLE_REVIEWS_RATE_WINDOW_SECONDS=60
```

Live retrieval occurs only when enabled and both the API key and Place ID exist. The read/write links must be HTTPS Google-owned URLs. The Place ID is environment configuration, not homepage content.

### Google Cloud setup

1. Open Google Cloud Console and select the project used only for the Mensah Rentals server integration.
2. Enable **Places API (New)** and enable billing when Google requires it.
3. Create a dedicated API key. Do not reuse a browser or mobile key.
4. Restrict the key's API restrictions to **Places API (New)**.
5. Apply a server-side application restriction, such as the production VPS public IP or CIDR, where practical.
6. Put the key only in the API runtime's secret environment configuration.
7. Set the verified Google business Place ID and official Google Maps review links.
8. Start with `GOOGLE_REVIEWS_LIVE_ENABLED=false`, run the admin connection test, and enable live rendering only after it succeeds.
9. Monitor Google quota, billing, and unauthorized use. Rotate the key immediately if compromised.

The admin UI reports booleans such as “API key configured: Yes/No”; it never manages, displays, or partially reveals credentials.

## Runtime and failure behavior

`GooglePlacesReviewsService` fixes the hostname and route in code, applies a 256 KiB response ceiling, validates JSON content type and shape, validates Google-owned HTTPS links, and enforces the configured timeout with `AbortController`. It safely classifies authorization, invalid-place, quota, timeout, upstream, and invalid-response failures. Public responses never contain the classification.

Simultaneous identical calls share one in-flight Promise. The reference is cleared as soon as the call settles. There is no completed-response cache, stale response, polling, retry loop, database table, Redis key, file, static JSON, or log containing Google Places content.

The public route is `GET /public/homepage/google-reviews`. It is `private, no-store`, noindex, and guarded by a bounded process-local billable-request ceiling. Production should additionally enforce a trusted-edge request limit and Google Cloud quota. No exact Google pricing is assumed; operators must review current billing before enablement.

The homepage fetches the endpoint in an isolated streamed server component only when the published review section is enabled. A slow Google response does not block the hero, catalogue links, or rental actions. Failure renders the existing CMS-authored heading and truthful Google-link fallback with no fake stars, rating, count, author, or review.

## Attribution and public presentation

Live cards display the returned author avatar when available, author name/profile link, rating with text equivalent, relative publish date, unchanged review text, individual `googleMapsUri`, optional reporting link, translation notice/original text, and jurisdictional visit month/year when supplied. Avatars load directly from an allowlisted Google-owned HTTPS URL and are not downloaded or stored.

The reviews container clearly says `Google Maps` with `translate="no"`, visually separates Google content, and states: “Reviews are selected and ordered by Google Maps based on relevance.” It links to Google's review policy. Every review has direct source access.

Public `/privacy` and `/terms` pages disclose the Google Maps integration and link to Google's privacy and terms. They are intentionally basic and require owner/legal review before production.

## Admin diagnostics

- `GET /admin/homepage/google-reviews/status` checks configuration only and makes no Google call.
- `POST /admin/homepage/google-reviews/test` performs one bounded live test.

Both require an active staff session and `homepage.google_reviews.view_status`; POST also requires the exact admin Origin and JSON. Results contain a safe status, optional business name/rating/count summary, returned-review count, and attribution completeness. They contain no review text, author data, raw response, Place ID, API key, stack trace, or upstream error body. Test results exist only in current browser state and are never written to homepage revisions or activities.

## Testing

Unit and API tests inject a fake fetch provider. Browser tests use a guarded Node fetch shim only while `MENSAH_ISOLATED_E2E=verified-local-test-database`; they never contact Google or the development database. The three browser scenarios are live, timeout, and quota-limited.

```powershell
pnpm test:e2e:homepage-google-reviews
pnpm test:e2e:homepage-all
```

An optional real local test is permitted only when valid ignored `.env` credentials already exist. Do not print the key or raw reviews. Report only connection success, business-name match, rating/count presence, returned-review count, and attribution presence.

Phase 17 remains explicitly deferred.
