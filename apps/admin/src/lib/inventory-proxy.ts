import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';

const identifier = '[a-z0-9]+';
const routes = [
  { pattern: /^$/, methods: new Set(['GET', 'POST']) },
  { pattern: new RegExp(`^${identifier}$`), methods: new Set(['GET']) },
  {
    pattern: new RegExp(`^${identifier}/(quantities|transactions)$`),
    methods: new Set(['GET']),
  },
  {
    pattern: new RegExp(`^${identifier}/(items|bulk-movements)$`),
    methods: new Set(['GET', 'POST']),
  },
  {
    pattern: new RegExp(
      `^${identifier}/items/${identifier}/state-transitions$`,
    ),
    methods: new Set(['POST']),
  },
] as const;
const queryKeys = new Set([
  'page',
  'pageSize',
  'search',
  'trackingMode',
  'sortBy',
  'sortDirection',
]);

export async function proxyInventory(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const path = segments.join('/');
  const route = routes.find(
    ({ methods, pattern }) => pattern.test(path) && methods.has(request.method),
  );
  if (!route)
    return Response.json(
      { message: 'Inventory route not allowed' },
      { status: 404 },
    );
  const unsafe = request.method !== 'GET';
  if (unsafe && request.headers.get('origin') !== getAdminOrigin())
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  const headers = new Headers();
  const name = getStaffSessionCookieName();
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (cookie) headers.set('Cookie', cookie);
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
      `${getApiInternalUrl()}/admin/inventory${path ? `/${path}` : ''}${query.size ? `?${query}` : ''}`,
      {
        method: request.method,
        headers,
        body: unsafe ? await request.text() : undefined,
        cache: 'no-store',
      },
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
      { message: 'Inventory service is unavailable' },
      { status: 503 },
    );
  }
}
