export interface AuditEntry {
  id: string;
  source: string;
  occurredAt: string;
  actor: { id: string; name: string } | null;
  domain: string;
  action: string;
  entity: { type: string; id?: string; reference?: string } | null;
  summary: string;
  metadata?: null;
}

export interface AuditResponse {
  items: AuditEntry[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  range: { startDate: string; endDate: string; timeZone: string };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function only(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function parseAuditEntry(value: unknown): AuditEntry | null {
  const item = object(value);
  if (
    !item ||
    !only(item, [
      'id',
      'source',
      'occurredAt',
      'actor',
      'domain',
      'action',
      'entity',
      'summary',
      'metadata',
    ]) ||
    !['id', 'source', 'occurredAt', 'domain', 'action', 'summary'].every(
      (key) => typeof item[key] === 'string',
    )
  )
    return null;
  if (item.metadata !== undefined && item.metadata !== null) return null;
  let actor: AuditEntry['actor'] = null;
  if (item.actor !== null) {
    const parsed = object(item.actor);
    if (
      !parsed ||
      !only(parsed, ['id', 'name']) ||
      typeof parsed.id !== 'string' ||
      typeof parsed.name !== 'string'
    )
      return null;
    actor = parsed as unknown as AuditEntry['actor'];
  }
  let entity: AuditEntry['entity'] = null;
  if (item.entity !== null) {
    const parsed = object(item.entity);
    if (
      !parsed ||
      !only(parsed, ['type', 'id', 'reference']) ||
      typeof parsed.type !== 'string' ||
      (parsed.id !== undefined && typeof parsed.id !== 'string') ||
      (parsed.reference !== undefined && typeof parsed.reference !== 'string')
    )
      return null;
    entity = parsed as unknown as AuditEntry['entity'];
  }
  return { ...(item as unknown as AuditEntry), actor, entity };
}

export function parseAuditResponse(value: unknown): AuditResponse | null {
  const root = object(value);
  if (
    !root ||
    !only(root, ['items', 'meta', 'range']) ||
    !Array.isArray(root.items)
  )
    return null;
  const items = root.items.map(parseAuditEntry);
  if (items.some((item) => !item)) return null;
  const meta = object(root.meta);
  if (
    !meta ||
    !only(meta, ['page', 'pageSize', 'total', 'totalPages']) ||
    !['page', 'pageSize', 'total', 'totalPages'].every(
      (key) => Number.isInteger(meta[key]) && Number(meta[key]) >= 0,
    )
  )
    return null;
  const range = object(root.range);
  if (
    !range ||
    !only(range, ['startDate', 'endDate', 'timeZone']) ||
    !['startDate', 'endDate', 'timeZone'].every(
      (key) => typeof range[key] === 'string',
    )
  )
    return null;
  return {
    items: items as AuditEntry[],
    meta: meta as unknown as AuditResponse['meta'],
    range: range as unknown as AuditResponse['range'],
  };
}
