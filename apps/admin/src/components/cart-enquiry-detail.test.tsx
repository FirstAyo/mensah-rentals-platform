import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CartEnquiryDetail } from './cart-enquiry-detail';

describe('CartEnquiryDetail', () => {
  it('renders a non-disclosing loading state before the protected record loads', () => {
    const html = renderToStaticMarkup(
      <CartEnquiryDetail canManage={false} id="cm00000000000000000000000" />,
    );
    expect(html).toContain('Loading cart enquiry');
    expect(html).not.toContain('passwordHash');
  });
});
