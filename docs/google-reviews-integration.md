# Google Reviews Integration

## Phase 16.4 decision

The homepage includes a polished Google Reviews section and optional public links for reading or writing a review. Live review cards are disabled by default; the UI never invents review text, ratings, counts, or testimonials.

The originally considered Places response cache was not implemented. Current Google Places policy prohibits prefetching, caching, or storing Places content beyond documented exceptions; Place IDs are the relevant storage exception. That conflicts with a persistent review cache and stale-if-error behavior.

Official references:

- [Places API policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Business Profile API policies](https://developers.google.com/my-business/content/policies)
- [Business Profile review data](https://developers.google.com/my-business/content/review-data)

## Safe configuration

```text
GOOGLE_PLACES_API_KEY=
GOOGLE_BUSINESS_PLACE_ID=
GOOGLE_REVIEWS_URL=
GOOGLE_WRITE_REVIEW_URL=
```

The API key and Place ID are never returned to the browser, stored in homepage records, or logged. The current public feature uses only validated HTTPS Google links. Admin status returns booleans and a safe explanation, never configuration values.

## Future live-review choices

Before enabling live cards, Mensah Rentals must explicitly approve either Places API (New) without content persistence or Google Business Profile API with approved account access and OAuth. Both require their then-current attribution, privacy, storage, and security rules. Tests must use a fake provider and never call Google. Review/rating structured data remains prohibited unless truthful data and current rules justify it.
