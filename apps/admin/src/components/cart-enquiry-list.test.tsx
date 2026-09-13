import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CartEnquiryList,
  DeliveryStatusBadge,
  EnquiryStatusBadge,
} from './cart-enquiry-list';

describe('CartEnquiryList', () => {
  it('renders an accessible initial loading state', () => {
    const html = renderToStaticMarkup(<CartEnquiryList />);
    expect(html).toContain('Cart enquiries');
    expect(html).toContain('Loading cart enquiries');
    expect(html).toContain('aria-live="polite"');
  });

  it('renders readable enquiry and delivery states', () => {
    expect(
      renderToStaticMarkup(<EnquiryStatusBadge status="RESOLVED" />),
    ).toContain('Resolved');
    expect(
      renderToStaticMarkup(<DeliveryStatusBadge status="FAILED" />),
    ).toContain('Failed');
  });
});
