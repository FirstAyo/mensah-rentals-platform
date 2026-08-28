import {
  namedSessionCookie,
  privateHeaders,
  proxyJson,
  readBoundedBody,
  safeApiUrl,
  validateMutation,
} from './phase18-proxy-shared';

const routes = new Map<string, { method: string; upstream: string }>([
  ['GET:', { method: 'GET', upstream: '/admin/feature-settings' }],
  [
    'GET:availability',
    { method: 'GET', upstream: '/admin/feature-settings/availability' },
  ],
  ['PUT:', { method: 'PUT', upstream: '/admin/feature-settings' }],
  [
    'POST:preview',
    { method: 'POST', upstream: '/admin/feature-settings/preview' },
  ],
  [
    'POST:presets/preview',
    { method: 'POST', upstream: '/admin/feature-settings/presets/preview' },
  ],
  [
    'POST:presets',
    { method: 'POST', upstream: '/admin/feature-settings/presets' },
  ],
]);

export async function proxyFeatureSettings(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const route = routes.get(`${request.method}:${segments.join('/')}`);
  if (!route || route.method !== request.method)
    return Response.json(
      { message: 'Feature settings route not allowed' },
      { status: 404, headers: privateHeaders() },
    );
  let body: string | undefined;
  if (request.method !== 'GET') {
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
  try {
    const upstream = await fetcher(safeApiUrl(route.upstream), {
      body,
      cache: 'no-store',
      headers,
      method: request.method,
    });
    return proxyJson(
      upstream,
      'Feature settings service returned an unsafe response',
    );
  } catch {
    return Response.json(
      { message: 'Feature settings service is unavailable' },
      { status: 503, headers: privateHeaders() },
    );
  }
}
