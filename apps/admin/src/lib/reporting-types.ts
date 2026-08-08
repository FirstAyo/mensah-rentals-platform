export type ReportKey =
  | 'overview'
  | 'rental-requests'
  | 'quotes-orders'
  | 'rentals-returns'
  | 'inventory'
  | 'maintenance';

export interface ReportMetric {
  key: string;
  label: string;
  value: number | string | null;
  format?: 'COUNT' | 'PERCENT' | 'MONEY' | 'DURATION';
  currency?: string;
  description?: string;
}

export interface ReportSeries {
  key: string;
  label: string;
  description?: string;
  points: Array<{ date: string; value: number }>;
}

export interface ReportRow {
  id: string;
  reference: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  occurredAt?: string | null;
  href?: string | null;
  fields: Array<{ label: string; value: string | number }>;
}

export interface ReportResponse {
  range: {
    startDate: string;
    endDate: string;
    timeZone: string;
    label?: string;
  };
  metrics: ReportMetric[];
  series: ReportSeries[];
  items?: ReportRow[];
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function parseReportResponse(value: unknown): ReportResponse | null {
  const root = record(value);
  if (
    !root ||
    !hasOnly(root, ['range', 'metrics', 'series', 'items', 'meta']) ||
    !Array.isArray(root.metrics) ||
    !Array.isArray(root.series)
  )
    return null;
  const range = record(root.range);
  if (
    !range ||
    !hasOnly(range, ['startDate', 'endDate', 'timeZone', 'label']) ||
    !['startDate', 'endDate', 'timeZone'].every(
      (key) => typeof range[key] === 'string',
    ) ||
    (range.label !== undefined && typeof range.label !== 'string')
  )
    return null;
  const metrics = root.metrics.flatMap((entry) => {
    const item = record(entry);
    if (
      !item ||
      !hasOnly(item, [
        'key',
        'label',
        'value',
        'format',
        'currency',
        'description',
      ]) ||
      typeof item.key !== 'string' ||
      typeof item.label !== 'string' ||
      (!['string', 'number'].includes(typeof item.value) &&
        item.value !== null) ||
      (item.format !== undefined &&
        !['COUNT', 'PERCENT', 'MONEY', 'DURATION'].includes(
          String(item.format),
        )) ||
      (item.currency !== undefined && typeof item.currency !== 'string') ||
      (item.description !== undefined && typeof item.description !== 'string')
    )
      return [];
    return [item as unknown as ReportMetric];
  });
  const series = root.series.flatMap((entry) => {
    const item = record(entry);
    if (
      !item ||
      !hasOnly(item, ['key', 'label', 'description', 'points']) ||
      typeof item.key !== 'string' ||
      typeof item.label !== 'string' ||
      (item.description !== undefined &&
        typeof item.description !== 'string') ||
      !Array.isArray(item.points)
    )
      return [];
    const points = item.points.flatMap((point) => {
      const parsed = record(point);
      return parsed &&
        hasOnly(parsed, ['date', 'value']) &&
        typeof parsed.date === 'string' &&
        typeof parsed.value === 'number' &&
        Number.isFinite(parsed.value)
        ? [{ date: parsed.date, value: parsed.value }]
        : [];
    });
    if (points.length !== item.points.length) return [];
    return [{ ...item, points } as ReportSeries];
  });
  if (
    metrics.length !== root.metrics.length ||
    series.length !== root.series.length
  )
    return null;
  let items: ReportRow[] | undefined;
  if (root.items !== undefined) {
    if (!Array.isArray(root.items)) return null;
    items = root.items.flatMap((entry) => {
      const item = record(entry);
      if (
        !item ||
        !hasOnly(item, [
          'id',
          'reference',
          'title',
          'subtitle',
          'status',
          'occurredAt',
          'href',
          'fields',
        ]) ||
        !['id', 'reference', 'title'].every(
          (key) => typeof item[key] === 'string',
        ) ||
        !['subtitle', 'status', 'occurredAt', 'href'].every(
          (key) =>
            item[key] === undefined ||
            item[key] === null ||
            typeof item[key] === 'string',
        ) ||
        !Array.isArray(item.fields)
      )
        return [];
      const fields = item.fields.flatMap((field) => {
        const parsed = record(field);
        return parsed &&
          hasOnly(parsed, ['label', 'value']) &&
          typeof parsed.label === 'string' &&
          (typeof parsed.value === 'string' || typeof parsed.value === 'number')
          ? [{ label: parsed.label, value: parsed.value }]
          : [];
      });
      return fields.length === item.fields.length
        ? [{ ...item, fields } as ReportRow]
        : [];
    });
    if (items.length !== root.items.length) return null;
  }
  let meta: ReportResponse['meta'];
  if (root.meta !== undefined) {
    const parsed = record(root.meta);
    if (
      !parsed ||
      !hasOnly(parsed, ['page', 'pageSize', 'total', 'totalPages']) ||
      !['page', 'pageSize', 'total', 'totalPages'].every(
        (key) => Number.isInteger(parsed[key]) && Number(parsed[key]) >= 0,
      )
    )
      return null;
    meta = parsed as unknown as NonNullable<ReportResponse['meta']>;
  }
  return {
    range: range as unknown as ReportResponse['range'],
    metrics,
    series,
    ...(items ? { items } : {}),
    ...(meta ? { meta } : {}),
  };
}

export const REPORT_DEFINITIONS: Record<
  ReportKey,
  { title: string; description: string; empty: string }
> = {
  overview: {
    title: 'Operational reports',
    description:
      'Understand what happened across the rental operation during a selected period.',
    empty: 'No operational activity was found for this period.',
  },
  'rental-requests': {
    title: 'Rental request report',
    description:
      'Review request volume, outcomes and movement into quotes and orders.',
    empty: 'No rental requests were found for this period.',
  },
  'quotes-orders': {
    title: 'Quotes and orders report',
    description:
      'Review commercial proposal and confirmed-order activity without treating values as collected revenue.',
    empty: 'No quotes or orders were found for this period.',
  },
  'rentals-returns': {
    title: 'Rentals and returns report',
    description:
      'Review active-rental, overdue, return and reconciliation activity.',
    empty: 'No rental or return activity was found for this period.',
  },
  inventory: {
    title: 'Inventory report',
    description:
      'Review confidential physical inventory states and authoritative inventory movements.',
    empty: 'No inventory movements matched these filters.',
  },
  maintenance: {
    title: 'Maintenance report',
    description:
      'Review maintenance workload, completion and inspection outcomes.',
    empty: 'No maintenance or inspection activity was found for this period.',
  },
};

export function availableReportKeys(permissionKeys: readonly string[]) {
  const permissions = new Set(permissionKeys);
  const available: ReportKey[] = ['overview'];
  if (permissions.has('rental_request.view')) available.push('rental-requests');
  if (permissions.has('quote.view') && permissions.has('order.view'))
    available.push('quotes-orders');
  if (
    permissions.has('active_rental.view') &&
    permissions.has('return.view') &&
    permissions.has('rental_issue.view')
  )
    available.push('rentals-returns');
  if (
    permissions.has('inventory.view') &&
    permissions.has('inventory.quantity.view') &&
    permissions.has('inventory.transaction.view')
  )
    available.push('inventory');
  if (permissions.has('maintenance.view') && permissions.has('inspection.view'))
    available.push('maintenance');
  return available;
}
