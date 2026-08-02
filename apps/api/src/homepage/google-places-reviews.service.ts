import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ApiEnvironment,
  type GoogleReviewsAdminStatus,
  type GoogleReviewsAdminTest,
  type GoogleReviewsDiagnosticStatus,
  type PublicGoogleReview,
  type PublicGoogleReviewsResponse,
  publicGoogleReviewsResponseSchema,
} from '@mensah-rentals/validation';
import { z } from 'zod';

export const GOOGLE_PLACES_FETCH = Symbol('GOOGLE_PLACES_FETCH');
export type GooglePlacesFetch = typeof fetch;

export const GOOGLE_PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places';
export const GOOGLE_PLACES_FIELD_MASK =
  'id,displayName,rating,userRatingCount,googleMapsUri,reviews';
const MAX_RESPONSE_BYTES = 256 * 1024;
const ORDERING_NOTICE =
  'Reviews are selected and ordered by Google Maps based on relevance.' as const;
const FALLBACK_MESSAGE =
  'Read customer feedback about Mensah Rentals on Google Maps.';

const localizedTextSchema = z
  .object({
    text: z.string().min(1).max(10_000),
    languageCode: z.string().max(35).optional(),
  })
  .strict();

const authorSchema = z
  .object({
    displayName: z.string().min(1).max(300),
    uri: z.string().url().optional(),
    photoUri: z.string().url().optional(),
  })
  .strict();

const googleReviewSchema = z
  .object({
    name: z.string().max(1024).optional(),
    relativePublishTimeDescription: z.string().min(1).max(200).optional(),
    text: localizedTextSchema,
    originalText: localizedTextSchema.optional(),
    rating: z.number().min(1).max(5),
    authorAttribution: authorSchema,
    publishTime: z.string().datetime({ offset: true }),
    flagContentUri: z.string().url().optional(),
    googleMapsUri: z.string().url(),
    visitDate: z
      .object({
        year: z.number().int().min(1).max(9999),
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(0).max(31).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const googlePlaceSchema = z
  .object({
    id: z.string().min(1).max(512),
    displayName: localizedTextSchema,
    rating: z.number().min(1).max(5),
    userRatingCount: z.number().int().min(0),
    googleMapsUri: z.string().url(),
    reviews: z.array(googleReviewSchema).max(5),
  })
  .strict();

class GooglePlacesFailure extends Error {
  constructor(readonly classification: GoogleReviewsDiagnosticStatus) {
    super(classification);
  }
}

function safeGoogleUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed =
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      host === 'google.ca' ||
      host.endsWith('.google.ca') ||
      host === 'googleusercontent.com' ||
      host.endsWith('.googleusercontent.com') ||
      host === 'goo.gl' ||
      host.endsWith('.goo.gl');
    return url.protocol === 'https:' && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES)
    throw new GooglePlacesFailure('INVALID_RESPONSE');
  if (!response.body) throw new GooglePlacesFailure('INVALID_RESPONSE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.byteLength;
    if (length > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new GooglePlacesFailure('INVALID_RESPONSE');
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new GooglePlacesFailure('INVALID_RESPONSE');
  }
}

@Injectable()
export class GooglePlacesReviewsService {
  private readonly logger = new Logger(GooglePlacesReviewsService.name);
  private inFlight: Promise<PublicGoogleReviewsResponse> | null = null;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(GOOGLE_PLACES_FETCH) private readonly fetcher: GooglePlacesFetch,
  ) {}

  status(): GoogleReviewsAdminStatus {
    const liveReviewsEnabled = this.config.get('GOOGLE_REVIEWS_LIVE_ENABLED', {
      infer: true,
    });
    const apiKeyConfigured = Boolean(
      this.config.get('GOOGLE_PLACES_API_KEY', { infer: true }),
    );
    const placeIdConfigured = Boolean(
      this.config.get('GOOGLE_BUSINESS_PLACE_ID', { infer: true }),
    );
    let status: GoogleReviewsDiagnosticStatus = 'READY';
    if (!liveReviewsEnabled) status = 'DISABLED';
    else if (!apiKeyConfigured) status = 'MISSING_API_KEY';
    else if (!placeIdConfigured) status = 'MISSING_PLACE_ID';
    return {
      status,
      liveReviewsEnabled,
      apiKeyConfigured,
      placeIdConfigured,
      reviewsUrlConfigured: Boolean(
        safeGoogleUrl(this.config.get('GOOGLE_REVIEWS_URL', { infer: true })),
      ),
      writeReviewUrlConfigured: Boolean(
        safeGoogleUrl(
          this.config.get('GOOGLE_WRITE_REVIEW_URL', { infer: true }),
        ),
      ),
      languageCode: this.config.get('GOOGLE_PLACES_LANGUAGE_CODE', {
        infer: true,
      }),
      regionCode: this.config.get('GOOGLE_PLACES_REGION_CODE', { infer: true }),
      timeoutMs: this.config.get('GOOGLE_PLACES_TIMEOUT_MS', { infer: true }),
    };
  }

  async publicResponse(): Promise<PublicGoogleReviewsResponse> {
    const configured = this.status();
    if (configured.status !== 'READY') return this.fallback('NOT_CONFIGURED');
    try {
      return await this.live();
    } catch (error) {
      this.logFailure(error);
      return this.fallback('UNAVAILABLE');
    }
  }

  async testConnection(): Promise<GoogleReviewsAdminTest> {
    const configured = this.status();
    if (configured.status !== 'READY')
      return {
        status: configured.status,
        message: this.safeMessage(configured.status),
        businessName: null,
        rating: null,
        reviewCount: null,
        reviewsReturned: 0,
        attributionComplete: false,
      };
    try {
      const response = await this.live();
      if (response.status !== 'LIVE')
        throw new GooglePlacesFailure('INVALID_RESPONSE');
      return {
        status: 'LIVE',
        message: 'Google Places connection succeeded.',
        businessName: response.businessName,
        rating: response.rating,
        reviewCount: response.reviewCount,
        reviewsReturned: response.reviews.length,
        attributionComplete: response.reviews.every((review) =>
          Boolean(review.author.displayName && review.googleMapsUri),
        ),
      };
    } catch (error) {
      const classification =
        error instanceof GooglePlacesFailure
          ? error.classification
          : 'UPSTREAM_UNAVAILABLE';
      this.logFailure(error);
      return {
        status: classification,
        message: this.safeMessage(classification),
        businessName: null,
        rating: null,
        reviewCount: null,
        reviewsReturned: 0,
        attributionComplete: false,
      };
    }
  }

  private live(): Promise<PublicGoogleReviewsResponse> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.request().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async request(): Promise<PublicGoogleReviewsResponse> {
    const apiKey = this.config.get('GOOGLE_PLACES_API_KEY', { infer: true });
    const placeId = this.config.get('GOOGLE_BUSINESS_PLACE_ID', {
      infer: true,
    });
    if (!apiKey || !placeId)
      throw new GooglePlacesFailure(
        apiKey ? 'MISSING_PLACE_ID' : 'MISSING_API_KEY',
      );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.get('GOOGLE_PLACES_TIMEOUT_MS', { infer: true }),
    );
    const endpoint = new URL(
      `${GOOGLE_PLACES_ENDPOINT}/${encodeURIComponent(placeId)}`,
    );
    endpoint.searchParams.set(
      'languageCode',
      this.config.get('GOOGLE_PLACES_LANGUAGE_CODE', { infer: true }),
    );
    endpoint.searchParams.set(
      'regionCode',
      this.config.get('GOOGLE_PLACES_REGION_CODE', { infer: true }),
    );
    this.logger.log({ event: 'google_places_reviews_request_started' });
    try {
      const response = await this.fetcher(endpoint, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw this.httpFailure(response.status);
      if (
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .startsWith('application/json')
      )
        throw new GooglePlacesFailure('INVALID_RESPONSE');
      const place = googlePlaceSchema.safeParse(
        await readBoundedJson(response),
      );
      if (!place.success) throw new GooglePlacesFailure('INVALID_RESPONSE');
      const mapped = this.map(place.data);
      this.logger.log({
        event: 'google_places_reviews_request_succeeded',
        reviewsReturned: mapped.reviews.length,
      });
      return publicGoogleReviewsResponseSchema.parse(mapped);
    } catch (error) {
      if (controller.signal.aborted) throw new GooglePlacesFailure('TIMEOUT');
      if (error instanceof GooglePlacesFailure) throw error;
      throw new GooglePlacesFailure('UPSTREAM_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }

  private map(place: z.infer<typeof googlePlaceSchema>) {
    const googleMapsUri = safeGoogleUrl(place.googleMapsUri);
    if (!googleMapsUri) throw new GooglePlacesFailure('INVALID_RESPONSE');
    const reviews = place.reviews
      .slice(0, 3)
      .map((review): PublicGoogleReview => {
        const source = safeGoogleUrl(review.googleMapsUri);
        if (!source) throw new GooglePlacesFailure('INVALID_RESPONSE');
        const original = review.originalText?.text ?? null;
        const translated = Boolean(
          original &&
            (original !== review.text.text ||
              review.originalText?.languageCode !== review.text.languageCode),
        );
        return {
          rating: review.rating,
          text: review.text.text,
          originalText: translated ? original : null,
          translated,
          relativePublishTimeDescription:
            review.relativePublishTimeDescription ?? null,
          publishTime: review.publishTime,
          googleMapsUri: source,
          flagContentUri: safeGoogleUrl(review.flagContentUri),
          visitDate: review.visitDate
            ? { year: review.visitDate.year, month: review.visitDate.month }
            : null,
          author: {
            displayName: review.authorAttribution.displayName,
            uri: safeGoogleUrl(review.authorAttribution.uri),
            photoUri: safeGoogleUrl(review.authorAttribution.photoUri),
          },
        };
      });
    if (!reviews.length) throw new GooglePlacesFailure('INVALID_RESPONSE');
    return {
      status: 'LIVE' as const,
      businessName: place.displayName.text,
      rating: place.rating,
      reviewCount: place.userRatingCount,
      googleMapsUri,
      reviews,
      orderingNotice: ORDERING_NOTICE,
      reviewsUrl:
        safeGoogleUrl(this.config.get('GOOGLE_REVIEWS_URL', { infer: true })) ??
        googleMapsUri,
      writeReviewUrl: safeGoogleUrl(
        this.config.get('GOOGLE_WRITE_REVIEW_URL', { infer: true }),
      ),
    };
  }

  private fallback(
    status: 'NOT_CONFIGURED' | 'UNAVAILABLE',
  ): PublicGoogleReviewsResponse {
    return {
      status,
      fallbackMessage: FALLBACK_MESSAGE,
      reviewsUrl: safeGoogleUrl(
        this.config.get('GOOGLE_REVIEWS_URL', { infer: true }),
      ),
      writeReviewUrl: safeGoogleUrl(
        this.config.get('GOOGLE_WRITE_REVIEW_URL', { infer: true }),
      ),
    };
  }

  private httpFailure(status: number): GooglePlacesFailure {
    if (status === 403) return new GooglePlacesFailure('AUTHORIZATION_FAILED');
    if (status === 404) return new GooglePlacesFailure('INVALID_PLACE_ID');
    if (status === 429) return new GooglePlacesFailure('QUOTA_LIMITED');
    if (status >= 500) return new GooglePlacesFailure('UPSTREAM_UNAVAILABLE');
    return new GooglePlacesFailure('INVALID_RESPONSE');
  }

  private logFailure(error: unknown) {
    const classification =
      error instanceof GooglePlacesFailure
        ? error.classification
        : 'UPSTREAM_UNAVAILABLE';
    this.logger.warn({
      event: 'google_places_reviews_request_failed',
      classification,
    });
  }

  private safeMessage(status: GoogleReviewsDiagnosticStatus): string {
    const messages: Record<GoogleReviewsDiagnosticStatus, string> = {
      DISABLED: 'Live Google reviews are disabled.',
      MISSING_API_KEY: 'The server API key is not configured.',
      MISSING_PLACE_ID: 'The Google business Place ID is not configured.',
      READY: 'Configuration is ready for a connection test.',
      LIVE: 'Google Places connection succeeded.',
      INVALID_PLACE_ID: 'Google could not find the configured business place.',
      AUTHORIZATION_FAILED: 'Google rejected the server credentials.',
      QUOTA_LIMITED: 'Google quota is currently unavailable.',
      TIMEOUT: 'The Google Places request timed out.',
      UPSTREAM_UNAVAILABLE: 'Google Places is temporarily unavailable.',
      INVALID_RESPONSE: 'Google returned an unusable response.',
    };
    return messages[status];
  }
}
