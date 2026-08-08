import { describe, expect, it } from 'vitest';

import {
  createCsv,
  csvCell,
  neutralizeSpreadsheetFormula,
  safeReportFilename,
} from './csv-export';

describe('CSV export safety', () => {
  it.each([
    '=SUM(A1:A2)',
    '+cmd',
    '-2+3',
    '@danger',
    '  =formula',
    '\t=hidden',
  ])('neutralizes spreadsheet formula input %j', (value) =>
    expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`),
  );

  it('quotes commas, quotes, and newlines with RFC 4180 escaping', () => {
    expect(csvCell('A, "quoted"\nvalue')).toBe('"A, ""quoted""\nvalue"');
  });

  it('creates a fixed-column CRLF document', () => {
    expect(createCsv(['Name', 'Value'], [['Chair', 4]])).toBe(
      '\uFEFFName,Value\r\nChair,4\r\n',
    );
  });

  it('builds a path-free filename', () => {
    expect(safeReportFilename('../orders', '2026-08-01', '2026-08-31')).toBe(
      'mensah-rentals----orders-2026-08-01-to-2026-08-31.csv',
    );
  });
});
