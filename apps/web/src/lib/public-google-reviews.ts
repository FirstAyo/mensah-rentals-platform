import 'server-only';
import {
  publicGoogleReviewsResponseSchema,
  type PublicGoogleReviewsResponse,
} from '@mensah-rentals/validation';

export async function getPublicGoogleReviews(): Promise<PublicGoogleReviewsResponse> {
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000'}/public/homepage/google-reviews`,
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error('Google reviews are unavailable.');
    return publicGoogleReviewsResponseSchema.parse(await response.json());
  } catch {
    return {
      status: 'UNAVAILABLE',
      fallbackMessage:
        'Read customer feedback about Mensah Rentals on Google Maps.',
      reviewsUrl: null,
      writeReviewUrl: null,
    };
  }
}
