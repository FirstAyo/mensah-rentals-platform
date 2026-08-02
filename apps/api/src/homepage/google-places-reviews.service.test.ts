import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GOOGLE_PLACES_FIELD_MASK,
  GooglePlacesReviewsService,
  type GooglePlacesFetch,
} from './google-places-reviews.service';

const key = 'server-secret-api-key';
const placeId = 'ChIJSafePlace123';
const responseBody = {
  id: placeId,
  displayName: { text: 'Mensah Rentals', languageCode: 'en-CA' },
  rating: 4.8,
  userRatingCount: 42,
  googleMapsUri: 'https://www.google.com/maps/place/mensah',
  reviews: [
    {
      name: 'places/test/reviews/one',
      relativePublishTimeDescription: 'a month ago',
      text: {
        text: 'Careful service and reliable equipment.',
        languageCode: 'en',
      },
      originalText: {
        text: 'Service soigneux et équipement fiable.',
        languageCode: 'fr',
      },
      rating: 5,
      authorAttribution: {
        displayName: 'Customer One',
        uri: 'https://www.google.com/maps/contrib/one',
        photoUri: 'https://lh3.googleusercontent.com/photo-one',
      },
      publishTime: '2026-06-01T12:00:00Z',
      flagContentUri: 'https://www.google.com/local/review/flag/one',
      googleMapsUri: 'https://www.google.com/maps/reviews/one',
      visitDate: { year: 2026, month: 5, day: 1 },
    },
    ...[2, 3, 4].map((number) => ({
      name: `places/test/reviews/${number}`,
      relativePublishTimeDescription: `${number} months ago`,
      text: { text: `Review ${number}`, languageCode: 'en' },
      originalText: { text: `Review ${number}`, languageCode: 'en' },
      rating: 4,
      authorAttribution: { displayName: `Customer ${number}` },
      publishTime: `2026-0${number}-01T12:00:00Z`,
      googleMapsUri: `https://www.google.com/maps/reviews/${number}`,
    })),
  ],
};

function config(overrides: Partial<ApiEnvironment> = {}) {
  const values = {
    GOOGLE_REVIEWS_LIVE_ENABLED: true,
    GOOGLE_PLACES_API_KEY: key,
    GOOGLE_BUSINESS_PLACE_ID: placeId,
    GOOGLE_PLACES_LANGUAGE_CODE: 'en-CA',
    GOOGLE_PLACES_REGION_CODE: 'CA',
    GOOGLE_PLACES_TIMEOUT_MS: 50,
    PUBLIC_GOOGLE_REVIEWS_RATE_LIMIT: 120,
    PUBLIC_GOOGLE_REVIEWS_RATE_WINDOW_SECONDS: 60,
    GOOGLE_REVIEWS_URL: 'https://www.google.com/maps/reviews/mensah',
    GOOGLE_WRITE_REVIEW_URL: 'https://www.google.com/maps/reviews/write',
    ...overrides,
  };
  return {
    get: vi.fn((name: keyof ApiEnvironment) => values[name]),
  } as unknown as ConfigService<ApiEnvironment, true>;
}

function jsonResponse(body: unknown = responseBody, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function service(
  fetcher: GooglePlacesFetch,
  overrides: Partial<ApiEnvironment> = {},
) {
  return new GooglePlacesReviewsService(config(overrides), fetcher);
}

describe('GooglePlacesReviewsService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the fixed Place Details (New) route, locale and explicit field mask', async () => {
    const fetcher = vi.fn(async () => jsonResponse());
    const result = await service(fetcher as GooglePlacesFetch).publicResponse();
    expect(result.status).toBe('LIVE');
    const [requestUrl, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(requestUrl));
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://places.googleapis.com/v1/places/${placeId}`,
    );
    expect(url.searchParams.get('languageCode')).toBe('en-CA');
    expect(url.searchParams.get('regionCode')).toBe('CA');
    expect(init?.headers).toMatchObject({
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
    });
    expect(GOOGLE_PLACES_FIELD_MASK).not.toContain('*');
  });

  it('maps rating, count, attribution, source links, translation and returned order', async () => {
    const result = await service(
      vi.fn(async () => jsonResponse()) as GooglePlacesFetch,
    ).publicResponse();
    expect(result).toMatchObject({
      status: 'LIVE',
      businessName: 'Mensah Rentals',
      rating: 4.8,
      reviewCount: 42,
    });
    if (result.status !== 'LIVE') throw new Error('Expected live response');
    expect(result.reviews).toHaveLength(3);
    expect(result.reviews.map((review) => review.text)).toEqual([
      'Careful service and reliable equipment.',
      'Review 2',
      'Review 3',
    ]);
    expect(result.reviews[0]).toMatchObject({
      translated: true,
      originalText: 'Service soigneux et équipement fiable.',
      relativePublishTimeDescription: 'a month ago',
      googleMapsUri: 'https://www.google.com/maps/reviews/one',
      author: { displayName: 'Customer One' },
      visitDate: { year: 2026, month: 5 },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /api-key|ChIJSafe|headers|name.*places\/test/i,
    );
  });

  it.each([
    [false, key, placeId, 'DISABLED'],
    [true, undefined, placeId, 'MISSING_API_KEY'],
    [true, key, undefined, 'MISSING_PLACE_ID'],
  ] as const)(
    'returns a safe unconfigured fallback without calling Google',
    async (enabled, apiKey, businessPlaceId, expected) => {
      const fetcher = vi.fn();
      const client = service(fetcher as GooglePlacesFetch, {
        GOOGLE_REVIEWS_LIVE_ENABLED: enabled,
        GOOGLE_PLACES_API_KEY: apiKey,
        GOOGLE_BUSINESS_PLACE_ID: businessPlaceId,
      });
      expect(client.status().status).toBe(expected);
      const result = await client.publicResponse();
      expect(result.status).toBe('NOT_CONFIGURED');
      expect(fetcher).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(key);
    },
  );

  it.each([
    [403, 'AUTHORIZATION_FAILED'],
    [404, 'INVALID_PLACE_ID'],
    [429, 'QUOTA_LIMITED'],
    [500, 'UPSTREAM_UNAVAILABLE'],
  ] as const)('classifies HTTP %s safely', async (status, classification) => {
    const client = service(
      vi.fn(async () =>
        jsonResponse({ error: { message: key } }, status),
      ) as GooglePlacesFetch,
    );
    expect((await client.publicResponse()).status).toBe('UNAVAILABLE');
    expect((await client.testConnection()).status).toBe(classification);
  });

  it('maps malformed JSON, an invalid shape, and a network failure safely', async () => {
    const malformed = service(
      vi.fn(
        async () =>
          new Response('{', {
            headers: { 'Content-Type': 'application/json' },
          }),
      ) as GooglePlacesFetch,
    );
    expect((await malformed.testConnection()).status).toBe('INVALID_RESPONSE');
    const wrongShape = service(
      vi.fn(async () =>
        jsonResponse({ displayName: { text: 'Only' } }),
      ) as GooglePlacesFetch,
    );
    expect((await wrongShape.testConnection()).status).toBe('INVALID_RESPONSE');
    const network = service(
      vi.fn(async () => {
        throw new Error(`network ${key}`);
      }) as GooglePlacesFetch,
    );
    expect((await network.testConnection()).status).toBe(
      'UPSTREAM_UNAVAILABLE',
    );
  });

  it('enforces timeout and bounded response size', async () => {
    const timeout = service(
      vi.fn(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ) as GooglePlacesFetch,
      { GOOGLE_PLACES_TIMEOUT_MS: 10 },
    );
    expect((await timeout.testConnection()).status).toBe('TIMEOUT');
    const oversized = service(
      vi.fn(
        async () =>
          new Response('x', {
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': String(256 * 1024 + 1),
            },
          }),
      ) as GooglePlacesFetch,
    );
    expect((await oversized.testConnection()).status).toBe('INVALID_RESPONSE');
  });

  it('deduplicates concurrent requests but retains no completed response', async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((complete) => (resolve = complete)),
      )
      .mockResolvedValue(jsonResponse());
    const client = service(fetcher as GooglePlacesFetch);
    const first = client.publicResponse();
    const second = client.publicResponse();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(jsonResponse());
    await Promise.all([first, second]);
    await client.publicResponse();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('never writes credentials or review/author content to logs', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await service(
      vi.fn(async () => jsonResponse()) as GooglePlacesFetch,
    ).publicResponse();
    await service(
      vi.fn(async () => jsonResponse({ error: key }, 403)) as GooglePlacesFetch,
    ).publicResponse();
    const output = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);
    expect(output).not.toMatch(
      /server-secret|Customer One|Careful service|googleusercontent/i,
    );
  });
});
