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

const cuid = '[a-z][a-z0-9]{20,31}';
const routes = [
  { pattern: /^$/, methods: ['GET', 'POST'] },
  { pattern: new RegExp(`^${cuid}$`), methods: ['GET'] },
  { pattern: new RegExp(`^${cuid}/drafts$`), methods: ['POST'] },
  {
    pattern: new RegExp(`^${cuid}/revisions/${cuid}/preview$`),
    methods: ['GET'],
  },
  {
    pattern: new RegExp(`^${cuid}/drafts/${cuid}/publish$`),
    methods: ['POST'],
  },
  { pattern: new RegExp(`^${cuid}/unpublish$`), methods: ['POST'] },
  { pattern: new RegExp(`^${cuid}/archive$`), methods: ['POST'] },
] as const;

const listQuery = new Set([
  'page',
  'pageSize',
  'search',
  'serviceType',
  'state',
]);

export async function proxyGallery(
  request: Request,
  path: string[],
  fetcher: typeof fetch = fetch,
) {
  const suffix = path.join('/');
  const route = routes.find((candidate) => candidate.pattern.test(suffix));
  if (!route || !(route.methods as readonly string[]).includes(request.method))
    return Response.json(
      { message: 'Gallery route not found' },
      { status: 404, headers: privateHeaders() },
    );

  const query = allowQuery(request, suffix ? new Set<string>() : listQuery);
  if (!query)
    return Response.json(
      { message: 'Gallery query is not allowed' },
      { status: 400, headers: privateHeaders() },
    );

  const unsafe = request.method !== 'GET';
  if (unsafe) {
    const rejection = validateMutation(request);
    if (rejection) return rejection;
  }

  const headers = new Headers();
  const cookie = namedSessionCookie(request);
  if (cookie) headers.set('Cookie', cookie);
  let body: string | undefined;
  if (unsafe) {
    headers.set('Origin', adminMutationOrigin());
    headers.set('Content-Type', 'application/json');
    body = (await readBoundedBody(request)) ?? undefined;
    if (body === undefined)
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413, headers: privateHeaders() },
      );
  }

  try {
    const upstream = await fetcher(
      safeApiUrl(
        `/admin/gallery/projects${suffix ? `/${suffix}` : ''}`,
        query.toString(),
      ),
      {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
      },
    );
    return proxyJson(upstream, 'Gallery service returned an unsafe response');
  } catch {
    return Response.json(
      { message: 'Gallery service is unavailable' },
      { status: 503, headers: privateHeaders() },
    );
  }
}
