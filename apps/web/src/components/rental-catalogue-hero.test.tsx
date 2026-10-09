import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RentalCatalogueHero } from './rental-catalogue-hero';

describe('RentalCatalogueHero', () => {
  it('renders aligned catalogue copy, category imagery, and accessible controls', () => {
    const html = renderToStaticMarkup(
      <RentalCatalogueHero
        slides={[
          {
            focalPoint: 'center 30%',
            name: 'Tables',
            url: '/media/categories/tables.webp',
          },
          {
            focalPoint: 'center',
            name: 'Tents',
            url: '/media/categories/tents.webp',
          },
        ]}
      />,
    );

    expect(html).toContain('data-rentals-hero="true"');
    expect(html).toContain('public-container');
    expect(html).toContain('Equipment for events, productions, and projects');
    expect(html).toContain('href="#catalogue-categories"');
    expect(html).toContain('Show Tables category image');
    expect(html).toContain('Show Tents category image');
    expect(html).toContain('Pause catalogue slideshow');
    expect(html).not.toMatch(/available|remaining|in stock|\$\d/i);
  });
});
