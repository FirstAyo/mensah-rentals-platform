import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AdminPage from './page';

describe('admin dashboard development page', () => {
  it('shows the required environment labels', () => {
    const html = renderToStaticMarkup(AdminPage());

    expect(html).toContain('Mensah Rentals Admin Dashboard');
    expect(html).toContain('Development Environment');
  });
});
