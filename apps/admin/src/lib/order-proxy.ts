import { getApiInternalUrl, getStaffSessionCookieName } from './auth-config';

const id = '[a-z0-9]+';
const routes = [
  { pattern: /^$/, methods: new Set(['GET']) },
  { pattern: new RegExp(`^${id}$`), methods: new Set(['GET']) },
] as const;

const queryKeys = new Set([
  'page',
  'pageSize',
  'search',
  'status',
  'reservationStatus',
  'fulfillmentMethod',
  'rentalStartFrom',
  'rentalStartTo',
  'sortBy',
  'sortDirection',
]);

export async function proxyOrder(
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
      { message: 'Rental order route not allowed' },
      { status: 404 },
    );

  const headers = new Headers({ Accept: 'application/json' });
  const cookieName = getStaffSessionCookieName();
  const session = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (session) headers.set('Cookie', session);

  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  for (const [key, value] of incoming.searchParams)
    if (queryKeys.has(key)) query.append(key, value);

  try {
    const upstream = await fetcher(
      `${getApiInternalUrl()}/admin/orders${path ? `/${path}` : ''}${query.size ? `?${query}` : ''}`,
      { method: 'GET', headers, cache: 'no-store' },
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
      { message: 'Rental order service is unavailable' },
      { status: 503 },
    );
  }
}
