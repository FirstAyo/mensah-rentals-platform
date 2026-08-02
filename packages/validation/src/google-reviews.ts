import { z } from 'zod';

const httpsUrl = z.string().url().startsWith('https://').max(2048);
const nullableHttpsUrl = httpsUrl.nullable();

export const googleReviewVisitDateSchema = z
  .object({
    year: z.number().int().min(1).max(9999),
    month: z.number().int().min(1).max(12),
  })
  .strict();

export const publicGoogleReviewSchema = z
  .object({
    rating: z.number().min(1).max(5),
    text: z.string().min(1).max(10_000),
    originalText: z.string().min(1).max(10_000).nullable(),
    translated: z.boolean(),
    relativePublishTimeDescription: z.string().min(1).max(200).nullable(),
    publishTime: z.string().datetime({ offset: true }),
    googleMapsUri: httpsUrl,
    flagContentUri: nullableHttpsUrl,
    visitDate: googleReviewVisitDateSchema.nullable(),
    author: z
      .object({
        displayName: z.string().min(1).max(300),
        uri: nullableHttpsUrl,
        photoUri: nullableHttpsUrl,
      })
      .strict(),
  })
  .strict();

const fallbackFields = {
  fallbackMessage: z.string().min(1).max(400),
  reviewsUrl: nullableHttpsUrl,
  writeReviewUrl: nullableHttpsUrl,
};

export const publicGoogleReviewsResponseSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('LIVE'),
        businessName: z.string().min(1).max(300),
        rating: z.number().min(1).max(5),
        reviewCount: z.number().int().min(0),
        googleMapsUri: httpsUrl,
        reviews: z.array(publicGoogleReviewSchema).min(1).max(3),
        orderingNotice: z.literal(
          'Reviews are selected and ordered by Google Maps based on relevance.',
        ),
        reviewsUrl: nullableHttpsUrl,
        writeReviewUrl: nullableHttpsUrl,
      })
      .strict(),
    z.object({ status: z.literal('UNAVAILABLE'), ...fallbackFields }).strict(),
    z
      .object({ status: z.literal('NOT_CONFIGURED'), ...fallbackFields })
      .strict(),
  ],
);

export const googleReviewsDiagnosticStatusSchema = z.enum([
  'DISABLED',
  'MISSING_API_KEY',
  'MISSING_PLACE_ID',
  'READY',
  'LIVE',
  'INVALID_PLACE_ID',
  'AUTHORIZATION_FAILED',
  'QUOTA_LIMITED',
  'TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
  'INVALID_RESPONSE',
]);

export const googleReviewsAdminStatusSchema = z
  .object({
    status: googleReviewsDiagnosticStatusSchema,
    liveReviewsEnabled: z.boolean(),
    apiKeyConfigured: z.boolean(),
    placeIdConfigured: z.boolean(),
    reviewsUrlConfigured: z.boolean(),
    writeReviewUrlConfigured: z.boolean(),
    languageCode: z.string(),
    regionCode: z.string(),
    timeoutMs: z.number().int(),
  })
  .strict();

export const googleReviewsAdminTestSchema = z
  .object({
    status: googleReviewsDiagnosticStatusSchema,
    message: z.string().min(1).max(300),
    businessName: z.string().min(1).max(300).nullable(),
    rating: z.number().min(1).max(5).nullable(),
    reviewCount: z.number().int().min(0).nullable(),
    reviewsReturned: z.number().int().min(0).max(3),
    attributionComplete: z.boolean(),
  })
  .strict();

export type PublicGoogleReview = z.infer<typeof publicGoogleReviewSchema>;
export type PublicGoogleReviewsResponse = z.infer<
  typeof publicGoogleReviewsResponseSchema
>;
export type GoogleReviewsDiagnosticStatus = z.infer<
  typeof googleReviewsDiagnosticStatusSchema
>;
export type GoogleReviewsAdminStatus = z.infer<
  typeof googleReviewsAdminStatusSchema
>;
export type GoogleReviewsAdminTest = z.infer<
  typeof googleReviewsAdminTestSchema
>;
