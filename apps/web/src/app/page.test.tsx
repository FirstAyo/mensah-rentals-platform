import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('customer website home page', () => {
  it('explains the rental-request model', () => {
    const html = renderToStaticMarkup(HomePage());

    expect(html).toContain('The right equipment');
    expect(html).toContain('custom quote');
    expect(html).not.toMatch(/available quantity|only \d+ left|checkout/i);
  });
});
