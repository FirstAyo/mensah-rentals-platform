import { NextResponse } from 'next/server';
import { rentalRequestReferenceSchema } from '@mensah-rentals/validation';

import { rentalRequestConfig } from './rental-request-config';

const CART_TOKEN_HEADER = 'x-rental-cart-token';
const REQUEST_TOKEN_HEADER = 'x-rental-request-token';

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function target(path: string[], method: string): string | null {
  if (path.length === 0 && method === 'POST') return '/public/rental-requests';
  if (
    path.length === 1 &&
    method === 'GET' &&
    rentalRequestReferenceSchema.safeParse(path[0]).success
  )
    return `/public/rental-requests/${encodeURIComponent(path[0]!)}`;
  return null;
}

export async function proxyRentalRequest(
  request: Request,
  path: string[],
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const config = rentalRequestConfig();
  const upstreamPath = target(path, request.method);
  if (!upstreamPath)
    return Response.json(
      { message: 'Rental request route not found' },
      { status: 404 },
    );
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== config.webOrigin)
      return Response.json(
        { message: 'Request origin is not allowed' },
        { status: 403 },
      );
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return Response.json(
        { message: 'JSON requests are required' },
        { status: 415 },
      );
  }

  const headers = new Headers({ Accept: 'application/json' });
  const requestToken = cookieValue(request, config.requestCookieName);
  if (requestToken && /^[A-Za-z0-9_-]{43}$/.test(requestToken))
    headers.set(REQUEST_TOKEN_HEADER, requestToken);
  let body: string | undefined;
  if (request.method === 'POST') {
    const cartToken = cookieValue(request, config.cartCookieName);
    if (cartToken && /^[A-Za-z0-9_-]{43}$/.test(cartToken))
      headers.set(CART_TOKEN_HEADER, cartToken);
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', config.webOrigin);
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 32 * 1024)
      return Response.json(
        { message: 'Rental request is too large' },
        { status: 413 },
      );
  }

  try {
    const upstream = await fetcher(`${config.apiUrl}${upstreamPath}`, {
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
    const nextToken = upstream.headers.get(REQUEST_TOKEN_HEADER);
    if (nextToken && /^[A-Za-z0-9_-]{43}$/.test(nextToken))
      response.cookies.set(config.requestCookieName, nextToken, {
        httpOnly: true,
        maxAge: config.ttlDays * 86_400,
        path: '/',
        sameSite: 'lax',
        secure: config.secure,
      });
    if (upstream.headers.get('x-rental-cart-clear') === 'true')
      response.cookies.set(config.cartCookieName, '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: process.env.PUBLIC_CART_COOKIE_SECURE === 'true',
      });
    return response;
  } catch {
    return Response.json(
      { message: 'Rental request service is unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
