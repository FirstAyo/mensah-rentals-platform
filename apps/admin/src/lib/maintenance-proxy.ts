import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';

const id = '[a-z0-9]+';
const routes = [
  { pattern: /^staff$/, methods: new Set(['GET']) },
  {
    pattern: new RegExp(`^sources/(issues|return-items)/${id}$`),
    methods: new Set(['GET']),
  },
  { pattern: /^work-orders$/, methods: new Set(['GET', 'POST']) },
  { pattern: new RegExp(`^work-orders/${id}$`), methods: new Set(['GET']) },
  {
    pattern: new RegExp(
      `^work-orders/${id}/(assign|unassign|update|start|waiting-for-parts|resume|ready-for-inspection|complete|cancel|notes)$`,
    ),
    methods: new Set(['POST']),
  },
  { pattern: /^inspections$/, methods: new Set(['GET', 'POST']) },
  { pattern: new RegExp(`^inspections/${id}$`), methods: new Set(['GET']) },
  {
    pattern: new RegExp(`^inspections/${id}/(start|pass|fail|cancel)$`),
    methods: new Set(['POST']),
  },
] as const;

const queryKeys = new Set([
  'page',
  'pageSize',
  'search',
  'status',
  'priority',
  'type',
  'source',
  'assignedToUserId',
  'overdue',
  'sortBy',
  'sortDirection',
  'rentalIssueId',
  'rentalReturnId',
  'inventoryId',
  'inventoryItemId',
  'sourceWorkOrderId',
  'inventoryState',
]);

const responseHeaders = (contentType = 'application/json') => ({
  'Cache-Control': 'private, no-store',
  'Content-Type': contentType,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});

export async function proxyMaintenance(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const path = segments.join('/');
  if (
    !routes.some(
      (route) => route.pattern.test(path) && route.methods.has(request.method),
    )
  )
    return Response.json(
      { message: 'Maintenance route not allowed' },
      { status: 404, headers: responseHeaders() },
    );

  const unsafe = request.method !== 'GET';
  if (unsafe && request.headers.get('origin') !== getAdminOrigin())
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403, headers: responseHeaders() },
    );

  let body: string | undefined;
  if (unsafe) {
    if (
      request.headers
        .get('content-type')
        ?.split(';', 1)[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    )
      return Response.json(
        { message: 'Content-Type must be application/json' },
        { status: 415, headers: responseHeaders() },
      );
    const declared = request.headers.get('content-length');
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > 64 * 1024)
    )
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413, headers: responseHeaders() },
      );
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 64 * 1024)
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413, headers: responseHeaders() },
      );
  }

  const headers = new Headers({ Accept: 'application/json' });
  const cookieName = getStaffSessionCookieName();
  const session = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (session) headers.set('Cookie', session);
  if (unsafe) {
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', getAdminOrigin());
  }
  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  for (const [key, value] of incoming.searchParams)
    if (queryKeys.has(key)) query.append(key, value);

  try {
    const upstream = await fetcher(
      `${getApiInternalUrl()}/admin/maintenance/${path}${query.size ? `?${query}` : ''}`,
      { method: request.method, headers, body, cache: 'no-store' },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders(
        upstream.headers.get('content-type') ?? 'application/json',
      ),
    });
  } catch {
    return Response.json(
      { message: 'Maintenance service is unavailable' },
      { status: 503, headers: responseHeaders() },
    );
  }
}
