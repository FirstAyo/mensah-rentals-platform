import {
  allowQuery,
  namedSessionCookie,
  privateHeaders,
  proxyJson,
  readBoundedBody,
  safeApiUrl,
  validateMutation,
} from './phase18-proxy-shared';

const queryKeys = new Set(['page', 'pageSize', 'search', 'status']);

export async function proxyContactEnquiries(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const [id, action] = segments;
  const isId = Boolean(id && /^[a-z0-9]{20,32}$/i.test(id));
  const allowed =
    (segments.length === 0 && request.method === 'GET') ||
    (segments.length === 1 && isId && request.method === 'GET') ||
    (segments.length === 2 &&
      isId &&
      action === 'status' &&
      request.method === 'PUT');
  if (!allowed)
    return Response.json(
      { message: 'Contact enquiry route not allowed' },
      { status: 404, headers: privateHeaders() },
    );
  const query = allowQuery(request, queryKeys);
  if (!query)
    return Response.json(
      { message: 'Contact enquiry query is not allowed' },
      { status: 400, headers: privateHeaders() },
    );
  let body: string | undefined;
  if (request.method === 'PUT') {
    const invalid = validateMutation(request);
    if (invalid) return invalid;
    const bounded = await readBoundedBody(request);
    if (bounded === null)
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413, headers: privateHeaders() },
      );
    body = bounded;
  }
  const headers = new Headers({ Accept: 'application/json' });
  const session = namedSessionCookie(request);
  if (session) headers.set('Cookie', session);
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', new URL(request.url).origin);
  }
  const path = id
    ? `/admin/contact-enquiries/${encodeURIComponent(id)}${action ? '/status' : ''}`
    : '/admin/contact-enquiries';
  try {
    const upstream = await fetcher(safeApiUrl(path, query.toString()), {
      body,
      cache: 'no-store',
      headers,
      method: request.method,
    });
    return proxyJson(
      upstream,
      'Contact enquiry service returned an unsafe response',
    );
  } catch {
    return Response.json(
      { message: 'Contact enquiry service is unavailable' },
      { status: 503, headers: privateHeaders() },
    );
  }
}
