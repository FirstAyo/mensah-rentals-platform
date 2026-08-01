import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/public-homepage', async () => {
  const { DEFAULT_HOMEPAGE_CONTENT } = await import(
    '@mensah-rentals/validation'
  );
  const publicMediaBlock = <T extends { mediaId: string | null }>(value: T) => {
    const result = { ...value, imageUrl: null };
    Reflect.deleteProperty(result, 'mediaId');
    return result;
  };
  return {
    getPublicHomepage: vi.fn(async () => ({
      content: {
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
        pickupDelivery: publicMediaBlock(
          DEFAULT_HOMEPAGE_CONTENT.pickupDelivery,
        ),
        finalCta: publicMediaBlock(DEFAULT_HOMEPAGE_CONTENT.finalCta),
      },
      categories: [
        {
          description: 'Seating',
          name: 'Seating',
          slug: 'seating',
          image: {
            url: null,
            altText: 'Seating rental equipment',
            focalPoint: 'center',
            source: 'DEFAULT_FALLBACK',
          },
        },
      ],
      products: [
        {
          category: {
            description: 'Seating',
            name: 'Seating',
            slug: 'seating',
          },
          images: [],
          isFeatured: true,
          name: 'Folding Chair',
          rentalUnit: 'each',
          shortDescription: 'Practical event seating.',
          slug: 'folding-chair',
        },
      ],
      googleReviews: {
        live: false,
        reviewsUrl: null,
        writeReviewUrl: null,
      },
    })),
  };
});

import HomePage from './page';

describe('customer website home page', () => {
  it('explains the rental-request model without price or availability claims', async () => {
    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain('The right equipment for the work ahead');
    expect(html).toContain('tailored quote');
    expect(html).toContain('Folding Chair');
    expect(html).not.toMatch(
      /only \d+ left|\d+ (available|remaining)|total quantity:|\$\d/i,
    );
  });
});
