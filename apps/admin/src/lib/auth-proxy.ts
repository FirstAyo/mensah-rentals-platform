import {
  buildClearedStaffCookie,
  getAdminOrigin,
  getApiInternalUrl,
} from './auth-config';

type AuthPath = '/auth/login' | '/auth/logout' | '/auth/me';

function copyResponse(upstream: Response, fallbackCookie?: string): Response {
  const headers = new Headers();
  headers.set(
    'Content-Type',
    upstream.headers.get('content-type') ?? 'application/json',
  );
  const setCookie = upstream.headers.get('set-cookie') ?? fallbackCookie;
  if (setCookie) {
    headers.set('Set-Cookie', setCookie);
  }

  return new Response(upstream.body, {
    headers,
    status: upstream.status,
  });
}

export async function proxyAuthPost(
  request: Request,
  path: Extract<AuthPath, '/auth/login' | '/auth/logout'>,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const allowedOrigin = getAdminOrigin();
  if (request.headers.get('origin') !== allowedOrigin) {
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    Origin: allowedOrigin,
  });
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  try {
    const upstream = await fetcher(`${getApiInternalUrl()}${path}`, {
      body: await request.text(),
      cache: 'no-store',
      headers,
      method: 'POST',
    });
    return copyResponse(
      upstream,
      path === '/auth/logout' ? buildClearedStaffCookie() : undefined,
    );
  } catch {
    if (path === '/auth/logout') {
      return new Response(null, {
        headers: { 'Set-Cookie': buildClearedStaffCookie() },
        status: 204,
      });
    }

    return Response.json(
      { message: 'Authentication service is unavailable' },
      { status: 503 },
    );
  }
}

export async function proxyAuthMe(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  try {
    const upstream = await fetcher(`${getApiInternalUrl()}/auth/me`, {
      cache: 'no-store',
      headers,
    });
    return copyResponse(upstream);
  } catch {
    return Response.json(
      { message: 'Authentication service is unavailable' },
      { status: 503 },
    );
  }
}
