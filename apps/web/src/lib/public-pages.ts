import 'server-only';
import { cache } from 'react';
import {
  publishedPublicPageResponseSchema,
  type PublicPageKey,
} from '@mensah-rentals/validation';

const forbidden =
  /inventory|stock|available|remaining|reserved|rented|damaged|maintenance|lost|asset|serial|transaction|internal|staff|role|permission|password|token|operation|payloadHash|createdBy|publishedBy|storagePath|mediaRef|databaseId|draft|audit/i;

function assertSafe(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertSafe);
  if (value && typeof value === 'object')
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.test(key)) throw new Error('Unsafe public page response.');
      assertSafe(nested);
    }
}

export const getPublishedPublicPage = cache(async (key: PublicPageKey) => {
  const response = await fetch(
    `${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000'}/public/pages/${key}`,
    { cache: 'no-store' },
  ).catch(() => null);
  if (!response?.ok) throw new Error('Public page is temporarily unavailable.');
  const body: unknown = await response.json();
  assertSafe(body);
  return publishedPublicPageResponseSchema.parse(body);
});
