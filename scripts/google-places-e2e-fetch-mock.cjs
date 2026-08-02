'use strict';
/* global process, DOMException, Response */

if (process.env.MENSAH_ISOLATED_E2E === 'verified-local-test-database') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function googlePlacesE2eFetch(input, init) {
    const url = String(input);
    if (!url.startsWith('https://places.googleapis.com/v1/places/'))
      return originalFetch(input, init);
    const scenario = process.env.GOOGLE_PLACES_E2E_SCENARIO;
    if (scenario === 'TIMEOUT') {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }
    if (scenario === 'QUOTA')
      return new Response(JSON.stringify({ error: { code: 429 } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    const reviews = [1, 2, 3].map((number) => ({
      relativePublishTimeDescription: `${number} months ago`,
      text: {
        text: `Test-owned Google review ${number}`,
        languageCode: 'en',
      },
      originalText: {
        text: `Test-owned Google review ${number}`,
        languageCode: 'en',
      },
      rating: number === 3 ? 4 : 5,
      authorAttribution: {
        displayName: `Test Reviewer ${number}`,
        uri: `https://www.google.com/maps/contrib/test-${number}`,
        photoUri: `https://lh3.googleusercontent.com/test-${number}`,
      },
      publishTime: `2026-0${number}-01T12:00:00Z`,
      flagContentUri: `https://www.google.com/local/review/flag/test-${number}`,
      googleMapsUri: `https://www.google.com/maps/reviews/test-${number}`,
    }));
    return new Response(
      JSON.stringify({
        id: 'ChIJE2EGoogleReviews',
        displayName: { text: 'Mensah Rentals', languageCode: 'en-CA' },
        rating: 4.8,
        userRatingCount: 42,
        googleMapsUri: 'https://www.google.com/maps/place/mensah-test',
        reviews,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  };
}
