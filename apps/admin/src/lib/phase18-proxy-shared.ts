import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';

export const privateHeaders = (contentType = 'application/json') => ({
  'Cache-Control': 'private, no-store',
  'Content-Type': contentType,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});

export function namedSessionCookie(request: Request) {
  const name = getStaffSessionCookieName();
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
}

export function safeApiUrl(path: string, query = '') {
  return `${getApiInternalUrl()}${path}${query ? `?${query}` : ''}`;
}

export function validateMutation(request: Request) {
  if (request.headers.get('origin') !== getAdminOrigin())
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403, headers: privateHeaders() },
    );
  if (
    request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase() !== 'application/json'
  )
    return Response.json(
      { message: 'Content-Type must be application/json' },
      { status: 415, headers: privateHeaders() },
    );
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 32 * 1024))
    return Response.json(
      { message: 'Request body is too large' },
      { status: 413, headers: privateHeaders() },
    );
  return null;
}

export function allowQuery(request: Request, keys: ReadonlySet<string>) {
  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  for (const [key, value] of incoming.searchParams) {
    if (!keys.has(key)) return null;
    query.append(key, value);
  }
  return query;
}

export async function readBoundedBody(request: Request) {
  const body = await request.text();
  return new TextEncoder().encode(body).byteLength <= 32 * 1024 ? body : null;
}

export async function proxyJson(upstream: Response, fallbackMessage: string) {
  const contentType = upstream.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (upstream.ok && contentType !== 'application/json')
    return Response.json(
      { message: fallbackMessage },
      { status: 502, headers: privateHeaders() },
    );
  const body = await upstream.text();
  if (new TextEncoder().encode(body).byteLength > 2 * 1024 * 1024)
    return Response.json(
      { message: fallbackMessage },
      { status: 502, headers: privateHeaders() },
    );
  return new Response(body, {
    status: upstream.status,
    headers: privateHeaders(
      upstream.headers.get('content-type') ?? 'application/json',
    ),
  });
}

export async function proxyValidatedJson<T>(
  upstream: Response,
  fallbackMessage: string,
  parser: (value: unknown) => T | null,
) {
  const contentType = upstream.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== 'application/json')
    return Response.json(
      { message: fallbackMessage },
      {
        status: upstream.ok ? 502 : upstream.status,
        headers: privateHeaders(),
      },
    );
  let value: unknown;
  try {
    value = await upstream.json();
  } catch {
    return Response.json(
      { message: fallbackMessage },
      {
        status: upstream.ok ? 502 : upstream.status,
        headers: privateHeaders(),
      },
    );
  }
  if (!upstream.ok) {
    const message =
      value &&
      typeof value === 'object' &&
      'message' in value &&
      typeof value.message === 'string' &&
      value.message.length <= 300
        ? value.message
        : fallbackMessage;
    return Response.json(
      { message },
      { status: upstream.status, headers: privateHeaders() },
    );
  }
  const parsed = parser(value);
  return parsed
    ? Response.json(parsed, {
        status: upstream.status,
        headers: privateHeaders(),
      })
    : Response.json(
        { message: fallbackMessage },
        { status: 502, headers: privateHeaders() },
      );
}

export async function proxyCsv(upstream: Response, fallbackName: string) {
  const contentType = upstream.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (upstream.ok && contentType !== 'text/csv')
    return Response.json(
      { message: 'Export service returned an unsafe document' },
      { status: 502, headers: privateHeaders() },
    );
  if (!upstream.ok)
    return proxyJson(upstream, 'Export service returned an unsafe response');
  const declared = upstream.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 10_000_000))
    return Response.json(
      { message: 'Export service returned a document that is too large' },
      { status: 502, headers: privateHeaders() },
    );
  const headers = new Headers(privateHeaders('text/csv; charset=utf-8'));
  const disposition = upstream.headers.get('content-disposition');
  headers.set(
    'Content-Disposition',
    disposition && /^attachment; filename="[A-Za-z0-9._-]+"$/.test(disposition)
      ? disposition
      : `attachment; filename="${fallbackName}"`,
  );
  return new Response(upstream.body, { status: upstream.status, headers });
}
