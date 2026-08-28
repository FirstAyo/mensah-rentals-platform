import { HOMEPAGE_MEDIA_LIMITS } from '@mensah-rentals/validation';

import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';

const key = '(?:ABOUT|CONTACT|TERMS|PRIVACY)';
const id = '[a-z0-9]+';
const routes = [
  { pattern: /^$/, methods: ['GET'] },
  { pattern: new RegExp(`^${key}$`), methods: ['GET'] },
  { pattern: new RegExp(`^${key}/draft$`), methods: ['PUT'] },
  { pattern: new RegExp(`^${key}/drafts/${id}/publish$`), methods: ['POST'] },
  {
    pattern: new RegExp(`^${key}/revisions/${id}/restore$`),
    methods: ['POST'],
  },
  { pattern: new RegExp(`^${key}/preview/${id}$`), methods: ['GET'] },
  { pattern: /^media$/, methods: ['POST'] },
  { pattern: /^media\/library$/, methods: ['GET'] },
  {
    pattern: new RegExp(`^media/${id}/[a-f0-9]{64}\\.webp$`),
    methods: ['GET'],
  },
] as const;

export async function proxyPublicPages(
  request: Request,
  path: string[],
  fetcher: typeof fetch = fetch,
) {
  const suffix = path.join('/');
  const route = routes.find((item) => item.pattern.test(suffix));
  if (!route || !(route.methods as readonly string[]).includes(request.method))
    return Response.json(
      { message: 'Public-page route not found' },
      { status: 404 },
    );
  const unsafe = request.method !== 'GET';
  if (unsafe && request.headers.get('origin') !== getAdminOrigin())
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  const headers = new Headers();
  const cookieName = getStaffSessionCookieName();
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (cookie) headers.set('Cookie', cookie);
  let body: Uint8Array | undefined;
  if (unsafe) {
    headers.set('Origin', getAdminOrigin());
    const type = request.headers.get('content-type') ?? '';
    const multipart = suffix === 'media';
    const limit = multipart
      ? HOMEPAGE_MEDIA_LIMITS.maxSourceBytes + 64 * 1024
      : 512 * 1024;
    if (
      multipart
        ? !type.toLowerCase().startsWith('multipart/form-data;')
        : type.split(';')[0]?.trim().toLowerCase() !== 'application/json'
    )
      return Response.json(
        {
          message: multipart
            ? 'Multipart image data is required'
            : 'JSON body is required',
        },
        { status: 415 },
      );
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > limit)
      return Response.json(
        { message: 'Request body exceeds the allowed size' },
        { status: 413 },
      );
    body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > limit)
      return Response.json(
        { message: 'Request body exceeds the allowed size' },
        { status: 413 },
      );
    headers.set('Content-Type', type);
  }
  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  if (suffix === 'media/library')
    for (const name of ['search', 'page', 'pageSize', 'source']) {
      const value = incoming.searchParams.get(name);
      if (value !== null) query.set(name, value.slice(0, 100));
    }
  const upstreamPath = suffix.startsWith('media')
    ? `/admin/public-pages-media${suffix === 'media' ? '' : `/${suffix.slice('media/'.length)}`}`
    : `/admin/public-pages${suffix ? `/${suffix}` : ''}`;
  try {
    const upstream = await fetcher(
      `${getApiInternalUrl()}${upstreamPath}${query.size ? `?${query}` : ''}`,
      {
        method: request.method,
        headers,
        body: body as BodyInit | undefined,
        cache: 'no-store',
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type':
          upstream.headers.get('content-type') ?? 'application/json',
        ...(suffix.includes('/preview/')
          ? { 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
          : {}),
      },
    });
  } catch {
    return Response.json(
      { message: 'Public-page service is unavailable' },
      { status: 503 },
    );
  }
}
