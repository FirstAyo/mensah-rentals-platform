import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';

const id = '[a-z0-9]+';
const returnRoutes = [
  { pattern: /^$/, methods: new Set(['GET']) },
  { pattern: new RegExp(`^active/${id}$`), methods: new Set(['GET', 'POST']) },
  { pattern: new RegExp(`^${id}$`), methods: new Set(['GET']) },
  { pattern: new RegExp(`^${id}/operations$`), methods: new Set(['POST']) },
  {
    pattern: new RegExp(`^${id}/(reconcile|complete|issues)$`),
    methods: new Set(['POST']),
  },
  {
    pattern: new RegExp(
      `^${id}/(receipt|inspection|missing|damage|reconciliation)-pdf$`,
    ),
    methods: new Set(['GET']),
  },
] as const;
const issueRoutes = [
  { pattern: /^$/, methods: new Set(['GET']) },
  { pattern: new RegExp(`^${id}$`), methods: new Set(['GET']) },
  { pattern: new RegExp(`^${id}/resolutions$`), methods: new Set(['POST']) },
] as const;
const queryKeys = new Set(['page', 'pageSize', 'search', 'status', 'type']);

export async function proxyReturnDomain(
  resource: 'returns' | 'issues',
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const path = segments.join('/');
  const routes = resource === 'returns' ? returnRoutes : issueRoutes;
  if (
    !routes.some(
      (route) => route.pattern.test(path) && route.methods.has(request.method),
    )
  )
    return Response.json(
      { message: 'Return route not allowed' },
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
    const declared = request.headers.get('content-length');
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > 64 * 1024)
    )
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
      );
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 64 * 1024)
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
  const upstreamPath =
    resource === 'issues'
      ? `/admin/rental-issues${path ? `/${path}` : ''}`
      : path.startsWith('active/')
        ? `/admin/active-rentals/${path.slice('active/'.length)}/return`
        : `/admin/returns${path ? `/${path}` : ''}`;
  const pdf = path.endsWith('-pdf');
  if (pdf) headers.set('Accept', 'application/pdf');
  try {
    const upstream = await fetcher(
      `${getApiInternalUrl()}${upstreamPath}${query.size ? `?${query}` : ''}`,
      { method: request.method, headers, body, cache: 'no-store' },
    );
    if (
      pdf &&
      upstream.ok &&
      upstream.headers.get('content-type')?.split(';', 1)[0] !==
        'application/pdf'
    )
      return Response.json(
        { message: 'Return service returned an unsafe document' },
        { status: 502 },
      );
    const responseHeaders = new Headers({
      'Cache-Control': 'private, no-store',
      'Content-Type': pdf
        ? 'application/pdf'
        : (upstream.headers.get('content-type') ?? 'application/json'),
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    });
    if (pdf) {
      const disposition = upstream.headers.get('content-disposition');
      responseHeaders.set(
        'Content-Disposition',
        disposition &&
          /^attachment; filename="[A-Za-z0-9._-]+"$/.test(disposition)
          ? disposition
          : 'attachment; filename="mensah-rentals-return.pdf"',
      );
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { message: 'Return service is unavailable' },
      { status: 503 },
    );
  }
}
