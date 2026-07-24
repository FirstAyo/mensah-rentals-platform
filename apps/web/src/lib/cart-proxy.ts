import { NextResponse } from 'next/server';
import { catalogueSlugSchema } from '@mensah-rentals/validation';

import { cartConfig } from './cart-config';

const TOKEN_HEADER = 'x-rental-cart-token';

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function upstreamPath(path: string[], method: string): string | null {
  if (path.length === 0 && ['GET', 'DELETE'].includes(method))
    return '/public/cart';
  if (
    path.length === 2 &&
    path[0] === 'items' &&
    ['PUT', 'DELETE'].includes(method) &&
    catalogueSlugSchema.safeParse(path[1]).success
  )
    return `/public/cart/items/${encodeURIComponent(path[1]!)}`;
  return null;
}

export async function proxyCart(
  request: Request,
  path: string[],
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const config = cartConfig();
  const target = upstreamPath(path, request.method);
  if (!target)
    return Response.json({ message: 'Cart route not found' }, { status: 404 });

  const unsafe = request.method !== 'GET';
  if (unsafe && request.headers.get('origin') !== config.webOrigin)
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  if (
    unsafe &&
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return Response.json(
      { message: 'JSON requests are required' },
      { status: 415 },
    );

  const headers = new Headers({ Accept: 'application/json' });
  const token = cookieValue(request, config.cookieName);
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token))
    headers.set(TOKEN_HEADER, token);
  if (unsafe) {
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', config.webOrigin);
  }
  let body: string | undefined;
  if (request.method === 'PUT') {
    body = await request.text();
    if (body.length > 1024)
      return Response.json(
        { message: 'Cart request is too large' },
        { status: 413 },
      );
  } else if (unsafe) {
    body = '{}';
  }

  try {
    const upstream = await fetcher(`${config.apiUrl}${target}`, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type':
          upstream.headers.get('content-type') ?? 'application/json',
      },
    });
    const nextToken = upstream.headers.get(TOKEN_HEADER);
    if (nextToken && /^[A-Za-z0-9_-]{43}$/.test(nextToken))
      response.cookies.set(config.cookieName, nextToken, {
        httpOnly: true,
        maxAge: config.ttlDays * 24 * 60 * 60,
        path: '/',
        sameSite: 'lax',
        secure: config.secure,
      });
    if (upstream.headers.get('x-rental-cart-clear') === 'true')
      response.cookies.set(config.cookieName, '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: config.secure,
      });
    return response;
  } catch {
    return Response.json(
      { message: 'Rental cart service is unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
