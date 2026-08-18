import { describe, expect, it } from 'vitest';

import { auditSeoEntries } from './seo-audit';

describe('SEO metadata quality audit', () => {
  it('accepts unique production catalogue metadata', () => {
    expect(
      auditSeoEntries([
        {
          canonical: 'https://mensahrentals.com/rentals/seating/chair',
          description: 'Request a chair rental for an event or production.',
          title: 'Chair Rental | Mensah Rentals',
        },
        {
          canonical: 'https://mensahrentals.com/rentals/power/fan',
          description: 'Request an industrial fan rental for your project.',
          title: 'Industrial Fan Rental | Mensah Rentals',
        },
      ]),
    ).toEqual([]);
  });

  it('reports duplicate, malformed, query, localhost, and unsafe values', () => {
    const issues = auditSeoEntries([
      {
        canonical: 'http://localhost:3000/rentals?page=2',
        description: 'Repeated description',
        title: 'Repeated title',
      },
      {
        canonical: 'not a URL',
        description: 'Repeated description',
        title: 'Repeated title',
      },
      {
        canonical: 'https://mensahrentals.com/rentals/unsafe',
        description: 'availableQuantity: 4',
        title: '',
      },
    ]);
    expect(issues.join('\n')).toMatch(
      /Non-production canonical|query or fragment/,
    );
    expect(issues.join('\n')).toMatch(/Duplicate title|Duplicate description/);
    expect(issues.join('\n')).toMatch(/Malformed canonical|Unsafe SEO-visible/);
    expect(issues.join('\n')).toMatch(/Missing title/);
  });
});
