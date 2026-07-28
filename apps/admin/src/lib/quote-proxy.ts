import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';

const id = '[a-z0-9]+';
const routes = [
  { pattern: /^$/, methods: new Set(['GET']) },
  { pattern: new RegExp(`^${id}$`), methods: new Set(['GET']) },
  {
    pattern: new RegExp(`^${id}/revisions$`),
    methods: new Set(['GET', 'POST']),
  },
  { pattern: new RegExp(`^${id}/revisions/${id}$`), methods: new Set(['GET']) },
  {
    pattern: new RegExp(`^${id}/revisions/${id}/send$`),
    methods: new Set(['POST']),
  },
  {
    pattern: new RegExp(`^${id}/revisions/${id}/order$`),
    methods: new Set(['POST']),
  },
  { pattern: new RegExp(`^request/${id}$`), methods: new Set(['POST']) },
] as const;
const queryKeys = new Set([
  'page',
  'pageSize',
  'search',
  'status',
  'validUntilFrom',
  'validUntilTo',
  'createdByUserId',
  'sortBy',
  'sortDirection',
]);
const maximumBody = 64 * 1024;

export async function proxyQuote(
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
      { message: 'Quote route not allowed' },
      { status: 404 },
    );
  const unsafe = request.method !== 'GET';
  if (unsafe && request.headers.get('origin') !== getAdminOrigin())
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
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
        { status: 415 },
      );
    const declaredLength = request.headers.get('content-length');
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBody)
    )
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
      );
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > maximumBody)
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
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
  const upstreamPath = path.startsWith('request/')
    ? `/admin/rental-requests/${encodeURIComponent(path.slice(8))}/quotes`
    : `/admin/quotes${path ? `/${path}` : ''}`;
  try {
    const upstream = await fetcher(
      `${getApiInternalUrl()}${upstreamPath}${query.size ? `?${query}` : ''}`,
      { method: request.method, headers, body, cache: 'no-store' },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type':
          upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch {
    return Response.json(
      { message: 'Quote service is unavailable' },
      { status: 503 },
    );
  }
}
