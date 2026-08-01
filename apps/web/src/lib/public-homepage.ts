import 'server-only';
import { cache } from 'react';
import {
  publicHomepageResponseSchema,
  type PublicHomepageResponse,
} from '@mensah-rentals/validation';

const forbidden =
  /inventory|quantity|stock|available|remaining|reserved|rented|damaged|maintenance|lost|asset|serial|transaction|internal|staff|role|permission|password|token|operation|payloadHash|createdBy|publishedBy|storagePath|apiKey|placeId|mediaId|databaseId|draft|audit/i;

function assertSafe(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertSafe);
  if (value && typeof value === 'object')
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.test(key))
        throw new Error('Unsafe public homepage response.');
      assertSafe(nested);
    }
}

export const getPublicHomepage = cache(
  async (): Promise<PublicHomepageResponse> => {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/public/homepage`,
      { cache: 'no-store' },
    );
    if (!response.ok)
      throw new Error('Homepage content is temporarily unavailable.');
    const body: unknown = await response.json();
    assertSafe(body);
    return publicHomepageResponseSchema.parse(body);
  },
);
