import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';

export type CatalogueResource = 'categories' | 'products';
const queryKeys = new Set([
  'page',
  'pageSize',
  'search',
  'sortBy',
  'sortDirection',
  'isActive',
  'isFeatured',
  'categoryId',
  'categorySlug',
]);

function sessionCookie(request: Request): string | null {
  const name = getStaffSessionCookieName();
  const match = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ?? null;
}

export async function proxyCatalogue(
  request: Request,
  resource: CatalogueResource,
  suffix = '',
  fetcher: typeof fetch = fetch,
) {
  const unsafe = request.method !== 'GET';
  if (unsafe && request.headers.get('origin') !== getAdminOrigin())
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  const headers = new Headers();
  const cookie = sessionCookie(request);
  if (cookie) headers.set('Cookie', cookie);
  if (unsafe) {
    const type = request.headers.get('content-type')?.split(';')[0]?.trim();
    if (request.method !== 'DELETE' && type !== 'application/json')
      return Response.json(
        { message: 'JSON body is required' },
        { status: 415 },
      );
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', getAdminOrigin());
  }
  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  for (const [key, value] of incoming.searchParams)
    if (queryKeys.has(key)) query.append(key, value);
  const url = `${getApiInternalUrl()}/admin/${resource}${suffix}${query.size ? `?${query}` : ''}`;
  let body: string | undefined;
  if (unsafe) {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > 64 * 1024)
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
  try {
    const upstream = await fetcher(url, {
      method: request.method,
      headers,
      cache: 'no-store',
      body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type':
          upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch {
    return Response.json(
      { message: 'Catalogue service is unavailable' },
      { status: 503 },
    );
  }
}
