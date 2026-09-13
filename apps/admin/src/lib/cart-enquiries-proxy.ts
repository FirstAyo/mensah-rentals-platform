import {
  adminMutationOrigin,
  allowQuery,
  namedSessionCookie,
  privateHeaders,
  proxyJson,
  readBoundedBody,
  safeApiUrl,
  validateMutation,
} from './phase18-proxy-shared';

const queryKeys = new Set([
  'page',
  'pageSize',
  'search',
  'status',
  'deliveryStatus',
]);
const idPattern = /^[a-z0-9]{20,32}$/i;

export async function proxyCartEnquiries(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const [id, area, action] = segments;
  const isId = Boolean(id && idPattern.test(id));
  const isList = segments.length === 0 && request.method === 'GET';
  const isDetail = segments.length === 1 && isId && request.method === 'GET';
  const isStatus =
    segments.length === 2 &&
    isId &&
    area === 'status' &&
    request.method === 'PUT';
  const isRetry =
    segments.length === 3 &&
    isId &&
    area === 'email' &&
    action === 'retry' &&
    request.method === 'POST';

  if (!isList && !isDetail && !isStatus && !isRetry)
    return Response.json(
      { message: 'Cart enquiry route not allowed' },
      { status: 404, headers: privateHeaders() },
    );

  const query = allowQuery(request, isList ? queryKeys : new Set<string>());
  if (!query)
    return Response.json(
      { message: 'Cart enquiry query is not allowed' },
      { status: 400, headers: privateHeaders() },
    );

  const mutation = request.method !== 'GET';
  let body: string | undefined;
  if (mutation) {
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
    headers.set('Origin', adminMutationOrigin());
  }

  const suffix = segments.length
    ? `/${segments.map(encodeURIComponent).join('/')}`
    : '';
  try {
    const upstream = await fetcher(
      safeApiUrl(
        `/admin/cart-enquiries${suffix}`,
        isList ? query.toString() : '',
      ),
      {
        body,
        cache: 'no-store',
        headers,
        method: request.method,
      },
    );
    return proxyJson(
      upstream,
      'Cart enquiry service returned an unsafe response',
    );
  } catch {
    return Response.json(
      { message: 'Cart enquiry service is unavailable' },
      { status: 503, headers: privateHeaders() },
    );
  }
}
