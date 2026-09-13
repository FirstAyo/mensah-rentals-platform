import { NextResponse } from 'next/server';
import { publicCartEnquiryReceiptSchema } from '@mensah-rentals/validation';

import { cartConfig } from '@/lib/cart-config';

const CART_TOKEN_HEADER = 'x-rental-cart-token';

function cookieValue(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function POST(request: Request) {
  const config = cartConfig();
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
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 16 * 1024)
    return Response.json(
      { message: 'Request body is too large' },
      { status: 413 },
    );
  const token = cookieValue(request, config.cookieName);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
    return Response.json(
      { message: 'Your rental cart is unavailable. Refresh and try again.' },
      { status: 422 },
    );
  try {
    const upstream = await fetch(`${config.apiUrl}/public/cart/enquiries`, {
      body,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: config.webOrigin,
        [CART_TOKEN_HEADER]: token,
      },
      method: 'POST',
    });
    const value: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const message =
        upstream.status === 409
          ? 'The customer submission option changed. Refresh and try again.'
          : upstream.status === 429
            ? 'Too many enquiry attempts. Please try again later.'
            : 'Your rental enquiry could not be submitted. Review the form and try again.';
      return Response.json(
        { message },
        {
          status: upstream.status,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }
    const receipt = publicCartEnquiryReceiptSchema.safeParse(value);
    if (!receipt.success)
      return Response.json(
        { message: 'The enquiry service returned an unsafe response.' },
        { status: 502 },
      );
    const response = NextResponse.json(receipt.data, {
      status: 202,
      headers: { 'Cache-Control': 'private, no-store' },
    });
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
      { message: 'The enquiry service is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
