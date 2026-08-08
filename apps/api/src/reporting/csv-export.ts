const FORMULA_PREFIX = /^[\s]*[=+\-@\t\r\n]/;

export function neutralizeSpreadsheetFormula(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | number | boolean | null): string {
  const source = value === null ? '' : String(value);
  const safe = neutralizeSpreadsheetFormula(source);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function createCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | boolean | null)[])[],
): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    if (row.length !== headers.length)
      throw new Error('CSV row does not match its header count');
    lines.push(row.map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function safeReportFilename(
  reportKey: string,
  startDate: string,
  endDate: string,
) {
  const safeKey = reportKey.replaceAll(/[^a-z0-9-]/g, '-');
  return `mensah-rentals-${safeKey}-${startDate}-to-${endDate}.csv`;
}
