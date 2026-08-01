import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  homepageContentSchema,
  publicHomepageResponseSchema,
  saveHomepageDraftSchema,
} from './homepage';

describe('homepage validation', () => {
  it('accepts the bounded default content', () => {
    expect(homepageContentSchema.parse(DEFAULT_HOMEPAGE_CONTENT)).toEqual(
      DEFAULT_HOMEPAGE_CONTENT,
    );
  });
  it('rejects public homepage records containing database media identifiers or extra fields', () => {
    const publicMediaBlock = <T extends { mediaId: string | null }>(
      value: T,
    ) => {
      const result = { ...value, imageUrl: null };
      Reflect.deleteProperty(result, 'mediaId');
      return result;
    };
    const publicContent = {
      ...DEFAULT_HOMEPAGE_CONTENT,
      seo: {
        title: DEFAULT_HOMEPAGE_CONTENT.seo.title,
        description: DEFAULT_HOMEPAGE_CONTENT.seo.description,
        socialImageUrl: null,
      },
      hero: { ...DEFAULT_HOMEPAGE_CONTENT.hero, slides: [] },
      solutions: {
        ...DEFAULT_HOMEPAGE_CONTENT.solutions,
        items: DEFAULT_HOMEPAGE_CONTENT.solutions.items.map(publicMediaBlock),
      },
      pickupDelivery: publicMediaBlock(DEFAULT_HOMEPAGE_CONTENT.pickupDelivery),
      finalCta: publicMediaBlock(DEFAULT_HOMEPAGE_CONTENT.finalCta),
    };
    const safe = {
      content: publicContent,
      categories: [],
      products: [],
      googleReviews: {
        live: false as const,
        reviewsUrl: null,
        writeReviewUrl: null,
      },
    };
    expect(publicHomepageResponseSchema.safeParse(safe).success).toBe(true);
    expect(
      publicHomepageResponseSchema.safeParse({
        ...safe,
        content: {
          ...safe.content,
          seo: { ...safe.content.seo, socialImageMediaId: 'secret-id' },
        },
      }).success,
    ).toBe(false);
  });
  it('rejects unsafe links, HTML-sized text, duplicate selections, and excessive slides', () => {
    expect(
      homepageContentSchema.safeParse({
        ...DEFAULT_HOMEPAGE_CONTENT,
        hero: {
          ...DEFAULT_HOMEPAGE_CONTENT.hero,
          primaryHref: 'javascript:alert(1)',
        },
      }).success,
    ).toBe(false);
    expect(
      saveHomepageDraftSchema.safeParse({
        expectedLockVersion: 0,
        operationId: randomUUID(),
        content: DEFAULT_HOMEPAGE_CONTENT,
        featuredCategoryIds: [
          'cm00000000000000000000000',
          'cm00000000000000000000000',
        ],
        featuredProductIds: [],
      }).success,
    ).toBe(false);
  });

  it('accepts existing product-image references and safe overlay presets', () => {
    const result = saveHomepageDraftSchema.parse({
      expectedLockVersion: 0,
      operationId: randomUUID(),
      content: {
        ...DEFAULT_HOMEPAGE_CONTENT,
        hero: {
          ...DEFAULT_HOMEPAGE_CONTENT.hero,
          overlayIntensity: 'MEDIUM',
          slides: [
            {
              desktopMediaId: 'product:cm00000000000000000000000',
              mobileMediaId: null,
              description: 'Existing product image',
              focalPoint: 'center',
              enabled: true,
            },
          ],
        },
      },
      featuredCategoryIds: ['cm00000000000000000000000'],
      featuredCategoryOverrides: [
        {
          categoryId: 'cm00000000000000000000000',
          mediaRef: 'product:cm00000000000000000000000',
          altText: 'Category cover',
          focalPoint: 'left',
        },
      ],
      featuredProductIds: [],
    });
    expect(result.content.hero.overlayIntensity).toBe('MEDIUM');
    expect(result.featuredCategoryOverrides).toHaveLength(1);
  });

  it('rejects unsafe zero-overlay values', () => {
    expect(
      homepageContentSchema.safeParse({
        ...DEFAULT_HOMEPAGE_CONTENT,
        hero: {
          ...DEFAULT_HOMEPAGE_CONTENT.hero,
          overlayIntensity: 'NONE',
        },
      }).success,
    ).toBe(false);
  });
});
