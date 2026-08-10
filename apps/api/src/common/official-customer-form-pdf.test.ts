import { describe, expect, it } from 'vitest';

import {
  buildOfficialCustomerFormPdf,
  OFFICIAL_CUSTOMER_FORM_ACKNOWLEDGEMENT,
  OFFICIAL_CUSTOMER_FORM_TERMS,
} from './official-customer-form-pdf';

const fixture = {
  customerId: 'MR-2026-00042',
  customerName: 'Alex Customer - Example Productions',
  documentDate: '2026-08-10',
  documentNumber: 'RO-2026-00042',
  dueDate: '2026-08-12',
  eventName: 'Summer Film Project',
  items: [
    { description: '20 inch Industrial Fan', duration: '3 days', quantity: 12 },
  ],
  kind: 'ORDER' as const,
  location: 'Richmond, BC',
  poNumber: '',
  quoteNumber: 'QT-2026-00042',
  rentalEndDate: '2026-08-12',
  rentalStartDate: '2026-08-10',
};

describe('official customer form PDF', () => {
  it('renders the official identity, fields, exact controlled legal copy, and safe metadata', () => {
    const text = buildOfficialCustomerFormPdf(fixture).toString('ascii');
    expect(text).toContain('%PDF-1.4');
    expect(text).toContain('Mensah Rentals & Services Inc.');
    expect(text).toContain('(ORDER)');
    expect(text).toContain('QT-2026-00042');
    expect(text).toContain('MR-2026-00042');
    expect(text).toContain('20 inch Industrial Fan');
    expect(text).toContain('3 days');
    expect(OFFICIAL_CUSTOMER_FORM_TERMS).toHaveLength(8);
    for (const term of OFFICIAL_CUSTOMER_FORM_TERMS)
      expect(text).toContain(term.slice(0, term.indexOf(':') + 1));
    expect(text).toContain(OFFICIAL_CUSTOMER_FORM_ACKNOWLEDGEMENT.slice(0, 80));
    expect(text).toContain('/Title (Mensah Rentals ORDER Form)');
    expect(text).not.toContain('capability');
  });

  it('contains no pricing labels, currencies, or sentinel financial values', () => {
    const text = buildOfficialCustomerFormPdf(fixture).toString('ascii');
    for (const forbidden of [
      'UNIT PRICE',
      'AMOUNT',
      'SUBTOTAL',
      'GST 5%',
      'PST 7%',
      'TOTAL',
      '$',
      'CAD',
      '123.45',
      '987.65',
    ])
      expect(text).not.toContain(forbidden);
  });

  it('continues long equipment lists without dropping items and keeps legal terms', () => {
    const items = Array.from({ length: 75 }, (_, index) => ({
      description: `Historical equipment snapshot line ${index + 1}`,
      duration: '3 days',
      quantity: index + 1,
    }));
    const text = buildOfficialCustomerFormPdf({ ...fixture, items }).toString(
      'ascii',
    );
    expect(text).toContain('Historical equipment snapshot line 1');
    expect(text).toContain('Historical equipment snapshot line 75');
    const pages = Number(text.match(/\/Count (\d+)/)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain('8. Equipment Return:');
  });

  it('renders the return variant without serialized or internal fixture data', () => {
    const text = buildOfficialCustomerFormPdf({
      ...fixture,
      kind: 'RETURN',
      items: [
        { description: 'Cinema Camera', duration: '3 days', quantity: 1 },
      ],
    }).toString('ascii');
    expect(text).toContain('(RETURN)');
    expect(text).toContain('Cinema Camera');
    expect(text).not.toContain('SERIAL-PRIVATE-001');
    expect(text).not.toContain('internalNotes');
  });

  it.skipIf(!process.env.OFFICIAL_PDF_RENDER_DIR)(
    'writes representative visual-review fixtures only when explicitly requested',
    () => {
      const directory = resolve(process.env.OFFICIAL_PDF_RENDER_DIR!);
      mkdirSync(directory, { recursive: true });
      const many = Array.from({ length: 48 }, (_, index) => ({
        description: `Equipment snapshot ${index + 1} with a print-readable description`,
        duration: '3 days',
        quantity: index + 1,
      }));
      for (const [filename, input] of [
        ['order-normal.pdf', fixture],
        ['order-many-items.pdf', { ...fixture, items: many }],
        ['return-completed.pdf', { ...fixture, kind: 'RETURN' as const }],
        [
          'return-several-items.pdf',
          { ...fixture, kind: 'RETURN' as const, items: many.slice(0, 8) },
        ],
      ] as const)
        writeFileSync(
          resolve(directory, filename),
          buildOfficialCustomerFormPdf(input),
        );
    },
  );
});
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
