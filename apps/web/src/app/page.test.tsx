import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('customer website development page', () => {
  it('shows the required environment labels', () => {
    const html = renderToStaticMarkup(HomePage());

    expect(html).toContain('Mensah Rentals Customer Website');
    expect(html).toContain('Development Environment');
  });
});
