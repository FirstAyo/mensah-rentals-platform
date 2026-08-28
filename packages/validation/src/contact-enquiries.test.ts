import { describe, expect, it } from 'vitest';

import { submitContactEnquirySchema } from './contact-enquiries';

const valid = {
  company: '  Studio North  ',
  email: ' CUSTOMER@Example.COM ',
  enquiryType: 'RENTAL_PROJECT' as const,
  message: ' We need equipment for a production next month. ',
  name: '  Amina Customer ',
  operationId: 'a6cae53d-b7b9-49f6-b6eb-09c48e491a42',
  phone: ' 604 555 0100 ',
  website: '',
};

describe('contact enquiry validation', () => {
  it('normalizes bounded customer input', () => {
    expect(submitContactEnquirySchema.parse(valid)).toEqual({
      ...valid,
      company: 'Studio North',
      email: 'customer@example.com',
      message: 'We need equipment for a production next month.',
      name: 'Amina Customer',
      phone: '604 555 0100',
    });
  });

  it.each([
    { ...valid, email: 'not-email' },
    { ...valid, message: 'short' },
    { ...valid, message: 'x'.repeat(4001) },
    { ...valid, name: 'x' },
    { ...valid, operationId: 'not-a-uuid' },
    { ...valid, inventoryQuantity: 12 },
  ])('rejects invalid, oversized, or unexpected input', (input) => {
    expect(submitContactEnquirySchema.safeParse(input).success).toBe(false);
  });
});
