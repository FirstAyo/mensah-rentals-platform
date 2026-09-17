import { describe, expect, it } from 'vitest';

import {
  createGalleryProjectSchema,
  createGallerySlug,
  gallerySlugWithSuffix,
  GALLERY_PROJECT_MEDIA_LIMIT,
  GALLERY_SLUG_MAX_LENGTH,
  publicGalleryQuerySchema,
} from './gallery';

describe('Gallery slug generation', () => {
  it.each([
    [
      '  Vancouver   Summer Corporate Gala  ',
      'vancouver-summer-corporate-gala',
    ],
    ['UPPER Case', 'upper-case'],
    ["Mensah's “Summer” Gala!", 'mensahs-summer-gala'],
    ['Events & Festivals', 'events-and-festivals'],
    ['Audio/Visual___Production', 'audio-visual-production'],
    ['déjà vu à Montréal', 'deja-vu-a-montreal'],
    ['one---two', 'one-two'],
    ['🎬 Film Night 🎉', 'film-night'],
  ])('converts %j to %j', (title, expected) => {
    expect(createGallerySlug(title)).toBe(expected);
  });

  it('returns no meaningless slug for unsupported or punctuation-only input', () => {
    expect(createGallerySlug('!!! 🎉 !!!')).toBe('');
    expect(createGallerySlug('東京')).toBe('');
  });

  it('bounds long slugs without a trailing or partial word when practical', () => {
    const slug = createGallerySlug(
      Array.from({ length: 50 }, (_, index) => `project${index}`).join(' '),
    );
    expect(slug.length).toBeLessThanOrEqual(GALLERY_SLUG_MAX_LENGTH);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('leaves room for deterministic uniqueness suffixes', () => {
    const slug = gallerySlugWithSuffix('a'.repeat(200), 23);
    expect(slug).toHaveLength(GALLERY_SLUG_MAX_LENGTH);
    expect(slug.endsWith('-23')).toBe(true);
  });

  it('enforces the shared 20-image project limit with a specific message', () => {
    const result = createGalleryProjectSchema.safeParse({
      operationId: 'fa40e80b-b72c-4d4c-ad4f-4489bd6136a1',
      content: {
        slug: 'gallery-project',
        title: 'Gallery project',
        serviceType: 'FILM_PRODUCTION',
        shortDescription: 'A project.',
        featured: false,
        sortOrder: 0,
      },
      media: Array.from(
        { length: GALLERY_PROJECT_MEDIA_LIMIT + 1 },
        (_, index) => ({
          mediaId: `cm000000000000000000000${String(index).padStart(2, '0')}`,
          altText: `Image ${index + 1}`,
          focalPoint: 'center',
        }),
      ),
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map(({ message }) => message)).toContain(
        'You can add up to 20 images to a Gallery project.',
      );
  });

  it('bounds public photo-feed pagination and validates event filters', () => {
    expect(
      publicGalleryQuerySchema.parse({ event: 'sample-event', page: '2' }),
    ).toMatchObject({ event: 'sample-event', page: 2, pageSize: 24 });
    expect(publicGalleryQuerySchema.safeParse({ pageSize: '49' }).success).toBe(
      false,
    );
    expect(
      publicGalleryQuerySchema.safeParse({ event: 'Unsafe Event' }).success,
    ).toBe(false);
  });
});
