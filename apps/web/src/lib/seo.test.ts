import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listCategoriesMock, listProductsMock } = vi.hoisted(() => ({
  listCategoriesMock: vi.fn(),
  listProductsMock: vi.fn(),
}));

vi.mock('./public-catalogue', () => ({
  listCategories: listCategoriesMock,
  listProducts: listProductsMock,
}));

import robots from '../app/robots';
import sitemap from '../app/sitemap';
import {
  absoluteSiteUrl,
  PRODUCTION_SITE_ORIGIN,
  publicPageRobots,
  siteOrigin,
} from './site-config';
import {
  organizationJsonLd,
  productJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from './structured-data';

beforeEach(() => {
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  delete process.env.SITE_URL;
  process.env.SITE_INDEXING_ENABLED = 'false';
  listCategoriesMock.mockImplementation(async (query: string) => ({
    items: [
      {
        name: query.includes('page=2') ? 'Tents' : 'Seating',
        slug: query.includes('page=2') ? 'tents' : 'seating',
        description: null,
      },
    ],
    meta: { totalPages: 2 },
  }));
  listProductsMock.mockImplementation(async (query: string) => ({
    items: [
      {
        name: query.includes('page=2') ? 'Tent' : 'Chair',
        slug: query.includes('page=2') ? 'tent' : 'chair',
        category: {
          name: 'Category',
          slug: query.includes('page=2') ? 'tents' : 'seating',
          description: null,
        },
        images: [],
        shortDescription: 'Description',
        rentalUnit: 'each',
        isFeatured: false,
      },
    ],
    meta: { totalPages: 2 },
  }));
});

describe('SEO origin contracts', () => {
  it('uses localhost only for non-indexed local development', () => {
    expect(siteOrigin()).toBe('http://localhost:3000');
    expect(absoluteSiteUrl('/rentals')).toBe('http://localhost:3000/rentals');
  });

  it('uses the authoritative non-www HTTPS origin in production', () => {
    process.env.SITE_URL = PRODUCTION_SITE_ORIGIN;
    process.env.SITE_INDEXING_ENABLED = 'true';
    expect(siteOrigin()).toBe('https://mensahrentals.com');
    expect(absoluteSiteUrl('/')).toBe('https://mensahrentals.com/');
  });

  it('fails closed when indexing is enabled for another origin', () => {
    process.env.SITE_URL = 'https://www.mensahrentals.com';
    process.env.SITE_INDEXING_ENABLED = 'true';
    expect(() => siteOrigin()).toThrow(/Indexing may only be enabled/);
  });

  it('keeps public metadata noindex/nofollow unless indexing is explicitly enabled', () => {
    expect(publicPageRobots()).toEqual({
      index: false,
      follow: false,
      nocache: true,
    });
    expect(publicPageRobots(false)).toEqual({
      index: false,
      follow: false,
      nocache: true,
    });

    process.env.SITE_INDEXING_ENABLED = 'true';
    expect(publicPageRobots()).toEqual({ index: true, follow: true });
    expect(publicPageRobots(false)).toEqual({ index: false, follow: true });
  });

  it.each([
    'https://user:secret@mensahrentals.com',
    'https://mensahrentals.com/path',
    'https://mensahrentals.com/?source=test',
    'https://mensahrentals.com/#fragment',
  ])('rejects unsafe SITE_URL value %s', (value) => {
    process.env.SITE_URL = value;
    expect(() => siteOrigin()).toThrow(/SITE_URL must be an HTTP\(S\) origin/);
  });
});

describe('robots and sitemap contracts', () => {
  it('disallows indexing locally', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('allows rentals while keeping operational routes out of crawling', () => {
    process.env.SITE_URL = PRODUCTION_SITE_ORIGIN;
    process.env.SITE_INDEXING_ENABLED = 'true';
    const value = robots();
    expect(JSON.stringify(value)).toMatch(
      /\/cart.*\/rental-request.*\/track-request.*\/quote.*\/order.*\/api/,
    );
    expect(JSON.stringify(value)).not.toContain('"/rentals"');
    expect(value.sitemap).toBe('https://mensahrentals.com/sitemap.xml');
  });

  it('emits unique absolute production URLs for every public page', async () => {
    process.env.SITE_URL = PRODUCTION_SITE_ORIGIN;
    const entries = await sitemap();
    const urls = entries.map(({ url }) => url);
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://mensahrentals.com/',
        'https://mensahrentals.com/rentals',
        'https://mensahrentals.com/rentals/tents/tent',
        'https://mensahrentals.com/privacy',
        'https://mensahrentals.com/terms',
      ]),
    );
    expect(new Set(urls).size).toBe(urls.length);
    expect(JSON.stringify(entries)).not.toMatch(
      /localhost|127\.0\.0\.1|admin|login|cart|rental-request|track-request|quote|order|\/api|\?/,
    );
  });
});

describe('structured-data contracts', () => {
  const product = {
    name: 'Chair',
    slug: 'chair',
    category: { name: 'Seating', slug: 'seating', description: null },
    images: [
      {
        altText: 'Black event chair',
        isPrimary: true,
        sortOrder: 0,
        url: '/media/products/chair.webp',
      },
    ],
    shortDescription: 'Chair for events.',
    description: null,
    rentalUnit: 'each',
    isFeatured: false,
    relatedProducts: [],
    specifications: [],
  };

  it('emits truthful Product data without commerce or inventory fields', () => {
    const data = productJsonLd(product, PRODUCTION_SITE_ORIGIN);
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Chair',
      url: 'https://mensahrentals.com/rentals/seating/chair',
    });
    expect(JSON.stringify(data)).not.toMatch(
      /offer|price|currency|availability|inventory|stock|rating|review|database|staff|capability|token/i,
    );
  });

  it('uses factual Organization and WebSite data without ratings or invented NAP', () => {
    const values = [
      organizationJsonLd(PRODUCTION_SITE_ORIGIN),
      websiteJsonLd(PRODUCTION_SITE_ORIGIN),
    ];
    expect(values.map((value) => value['@type'])).toEqual([
      'Organization',
      'WebSite',
    ]);
    expect(JSON.stringify(values)).not.toMatch(
      /AggregateRating|address|openingHours|geo|sameAs|priceRange/,
    );
  });

  it('escapes script-closing CMS or product content safely', () => {
    const serialized = serializeJsonLd({ name: '</script><script>alert(1)' });
    expect(serialized).not.toContain('</script>');
    expect(JSON.parse(serialized)).toEqual({
      name: '</script><script>alert(1)',
    });
  });
});
