import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';
import { HOMEPAGE_MEDIA_LIMITS } from '@mensah-rentals/validation';

const id = '[a-z0-9]+';
const routes = [
  { pattern: /^$/, methods: ['GET'] },
  { pattern: /^drafts$/, methods: ['POST'] },
  { pattern: new RegExp(`^drafts/${id}/publish$`), methods: ['POST'] },
  { pattern: new RegExp(`^revisions/${id}/preview$`), methods: ['GET'] },
  { pattern: new RegExp(`^revisions/${id}/restore$`), methods: ['POST'] },
  { pattern: /^media$/, methods: ['GET', 'POST'] },
  { pattern: /^media\/library$/, methods: ['GET'] },
  { pattern: new RegExp(`^media/${id}$`), methods: ['DELETE'] },
  {
    pattern: new RegExp(`^media/${id}/[a-f0-9]{64}\\.webp$`),
    methods: ['GET'],
  },
  { pattern: /^google-reviews\/status$/, methods: ['GET'] },
  { pattern: /^google-reviews\/test$/, methods: ['POST'] },
] as const;

function sessionCookie(request: Request) {
  const name = getStaffSessionCookieName();
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
}

async function boundedBody(request: Request, max: number) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.byteLength <= max ? bytes : null;
}

export async function proxyHomepage(
  request: Request,
  path: string[],
  fetcher: typeof fetch = fetch,
) {
  const suffix = path.join('/');
  const route = routes.find((candidate) => candidate.pattern.test(suffix));
  if (!route || !(route.methods as readonly string[]).includes(request.method))
    return Response.json(
      { message: 'Homepage route not found' },
      { status: 404 },
    );
  const unsafe = request.method !== 'GET';
  if (unsafe && request.headers.get('origin') !== getAdminOrigin())
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  const headers = new Headers();
  const cookie = sessionCookie(request);
  if (cookie) headers.set('Cookie', cookie);
  let body: Uint8Array | undefined;
  if (unsafe) {
    headers.set('Origin', getAdminOrigin());
    const type = request.headers.get('content-type') ?? '';
    const multipart = suffix === 'media' && request.method === 'POST';
    if (multipart) {
      if (!type.toLowerCase().startsWith('multipart/form-data;'))
        return Response.json(
          { message: 'Multipart image data is required' },
          { status: 415 },
        );
      headers.set('Content-Type', type);
      body =
        (await boundedBody(
          request,
          HOMEPAGE_MEDIA_LIMITS.maxSourceBytes + 64 * 1024,
        )) ?? undefined;
    } else {
      if (type.split(';')[0]?.trim().toLowerCase() !== 'application/json')
        return Response.json(
          { message: 'JSON body is required' },
          { status: 415 },
        );
      headers.set('Content-Type', 'application/json');
      body = (await boundedBody(request, 512 * 1024)) ?? undefined;
    }
    if (!body)
      return Response.json(
        { message: 'Request body exceeds the allowed size' },
        { status: 413 },
      );
  }
  try {
    const incoming = new URL(request.url);
    const query = new URLSearchParams();
    if (suffix === 'media/library') {
      for (const key of ['search', 'page', 'pageSize', 'source']) {
        const value = incoming.searchParams.get(key);
        if (value !== null) query.set(key, value.slice(0, 100));
      }
    }
    const upstream = await fetcher(
      `${getApiInternalUrl()}/admin/homepage${suffix ? `/${suffix}` : ''}${query.size ? `?${query}` : ''}`,
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
        ...(suffix.endsWith('/preview')
          ? { 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
          : {}),
      },
    });
  } catch {
    return Response.json(
      { message: 'Homepage service is unavailable' },
      { status: 503 },
    );
  }
}
