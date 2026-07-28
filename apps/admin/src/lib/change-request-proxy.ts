import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';

const identifier = /^[a-z0-9]+$/i;

export async function proxyChangeRequest(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const valid =
    (segments.length === 0 && request.method === 'GET') ||
    (segments.length === 1 &&
      identifier.test(segments[0] ?? '') &&
      request.method === 'GET') ||
    (segments.length === 2 &&
      identifier.test(segments[0] ?? '') &&
      segments[1] === 'review-state' &&
      request.method === 'PUT');
  if (!valid)
    return Response.json(
      { message: 'Change request route not allowed' },
      { status: 404 },
    );
  const unsafe = request.method !== 'GET';
  if (unsafe && request.headers.get('origin') !== getAdminOrigin())
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  const headers = new Headers({ Accept: 'application/json' });
  const cookieName = getStaffSessionCookieName();
  const sessionCookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (sessionCookie) headers.set('Cookie', sessionCookie);
  let body: string | undefined;
  if (unsafe) {
    const mediaType = request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== 'application/json')
      return Response.json(
        { message: 'Content-Type must be application/json' },
        { status: 415 },
      );
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 16 * 1024)
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
      );
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', getAdminOrigin());
  }
  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ['page', 'pageSize', 'status']) {
    for (const value of incoming.searchParams.getAll(key))
      query.append(key, value);
  }
  try {
    const path = segments.length ? `/${segments.join('/')}` : '';
    const upstream = await fetcher(
      `${getApiInternalUrl()}/admin/change-requests${path}${query.size ? `?${query}` : ''}`,
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
      { message: 'Change request service is unavailable' },
      { status: 503 },
    );
  }
}
