import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPublicGallery, getPublicGalleryProject } from './public-gallery';

const summary = {
  cover: {
    altText: 'Production equipment ready on site',
    focalPoint: 'center',
    url: `/media/homepage/project/${'a'.repeat(64)}.webp`,
    width: 1600,
    height: 1200,
  },
  eventDate: null,
  imageCount: 1,
  location: 'Richmond, BC',
  service: { label: 'Film Production', slug: 'film-production' },
  shortDescription: 'Equipment supporting a production.',
  slug: 'sample-production',
  title: 'Sample Production',
};

afterEach(() => vi.unstubAllGlobals());

describe('public Gallery server boundary', () => {
  it('accepts the explicit public list shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          items: [summary],
          meta: {
            hasMore: false,
            page: 1,
            pageSize: 24,
            total: 1,
            totalPages: 1,
          },
          photos: [
            {
              event: {
                shortDescription: summary.shortDescription,
                slug: summary.slug,
                title: summary.title,
              },
              eventImageCount: 1,
              eventImageIndex: 1,
              image: summary.cover,
              key: 'sample-production:1',
              service: summary.service,
            },
          ],
          selectedEvent: null,
          selectedType: null,
          services: [summary.service],
        }),
      ),
    );
    await expect(getPublicGallery()).resolves.toMatchObject({
      items: [{ slug: 'sample-production' }],
    });
  });

  it('recursively rejects internal data in a public project', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...summary,
          description: null,
          media: [summary.cover],
          seo: {
            description: 'A project by Mensah Rentals.',
            title: 'Sample Production',
          },
          inventory: { available: 4 },
        }),
      ),
    );
    await expect(getPublicGalleryProject(summary.slug)).rejects.toThrow(
      /Unsafe public Gallery/,
    );
  });
});
