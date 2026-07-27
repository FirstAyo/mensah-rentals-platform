import { NextResponse } from 'next/server';
import type { PublicQuoteResponse } from '@mensah-rentals/types';
import {
  quoteCustomerAccessSchema,
  quoteCustomerResponseSchema,
} from '@mensah-rentals/validation';

import { quoteConfig } from './quote-config';

const capabilityHeader = 'x-quote-capability';
const rootKeys = [
  'chargeTotalCents',
  'charges',
  'currency',
  'customerName',
  'customerNotes',
  'discountCents',
  'itemSubtotalCents',
  'items',
  'notice',
  'quoteNumber',
  'rentalEndDate',
  'rentalStartDate',
  'revisionNumber',
  'status',
  'subtotalCents',
  'taxableSubtotalCents',
  'tax',
  'taxCents',
  'terms',
  'totalCents',
  'validUntil',
] as const;
const itemKeys = [
  'approvedQuantity',
  'lineSubtotalCents',
  'productName',
  'productSlug',
  'quotedQuantity',
  'rentalUnit',
  'taxable',
  'unitPriceCents',
] as const;
const chargeKeys = ['amountCents', 'label', 'taxable', 'type'] as const;
const taxKeys = [
  'name',
  'rateBasisPoints',
  'taxAmountCents',
  'taxableAmountCents',
] as const;
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function cents(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isPublicQuote(value: unknown): value is PublicQuoteResponse {
  if (!object(value) || !exact(value, rootKeys)) return false;
  if (
    value.currency !== 'CAD' ||
    typeof value.customerName !== 'string' ||
    typeof value.notice !== 'string' ||
    typeof value.quoteNumber !== 'string' ||
    typeof value.rentalStartDate !== 'string' ||
    typeof value.rentalEndDate !== 'string' ||
    typeof value.validUntil !== 'string'
  )
    return false;
  if (
    ![value.customerNotes, value.terms].every(
      (entry) => entry === null || typeof entry === 'string',
    )
  )
    return false;
  if (
    ![
      'SENT',
      'VIEWED',
      'ACCEPTED',
      'REJECTED',
      'EXPIRED',
      'SUPERSEDED',
    ].includes(String(value.status)) ||
    !Number.isInteger(value.revisionNumber)
  )
    return false;
  if (
    ![
      'chargeTotalCents',
      'discountCents',
      'itemSubtotalCents',
      'subtotalCents',
      'taxableSubtotalCents',
      'taxCents',
      'totalCents',
    ].every((key) => cents(value[key]))
  )
    return false;
  if (
    !Array.isArray(value.items) ||
    !value.items.every(
      (entry) =>
        object(entry) &&
        exact(entry, itemKeys) &&
        cents(entry.approvedQuantity) &&
        cents(entry.lineSubtotalCents) &&
        cents(entry.quotedQuantity) &&
        cents(entry.unitPriceCents) &&
        typeof entry.productName === 'string' &&
        typeof entry.productSlug === 'string' &&
        typeof entry.rentalUnit === 'string' &&
        typeof entry.taxable === 'boolean',
    )
  )
    return false;
  if (
    !Array.isArray(value.charges) ||
    !value.charges.every(
      (entry) =>
        object(entry) &&
        exact(entry, chargeKeys) &&
        cents(entry.amountCents) &&
        typeof entry.label === 'string' &&
        typeof entry.taxable === 'boolean' &&
        ['DELIVERY', 'PICKUP', 'SETUP', 'TEARDOWN', 'LABOUR', 'OTHER'].includes(
          String(entry.type),
        ),
    )
  )
    return false;
  return (
    object(value.tax) &&
    exact(value.tax, taxKeys) &&
    typeof value.tax.name === 'string' &&
    cents(value.tax.rateBasisPoints) &&
    cents(value.tax.taxableAmountCents) &&
    cents(value.tax.taxAmountCents)
  );
}

function cookieValue(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function proxyQuote(
  request: Request,
  path: string[],
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const config = quoteConfig();
  const joined = path.join('/');
  const route =
    joined === '' && request.method === 'GET'
      ? 'current'
      : joined === 'access' && request.method === 'POST'
        ? 'access'
        : joined === 'view' && request.method === 'POST'
          ? 'current/view'
          : joined === 'respond' && request.method === 'POST'
            ? 'current/respond'
            : null;
  if (!route)
    return Response.json({ message: 'Quote route not found' }, { status: 404 });
  const unsafe = request.method === 'POST';
  if (unsafe && request.headers.get('origin') !== config.webOrigin)
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  if (
    unsafe &&
    request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase() !== 'application/json'
  )
    return Response.json(
      { message: 'JSON requests are required' },
      { status: 415 },
    );
  let body: unknown = undefined;
  if (unsafe) {
    const declaredLength = request.headers.get('content-length');
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 8 * 1024)
    )
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
      );
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 8 * 1024)
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
      );
    try {
      body = JSON.parse(text || '{}') as unknown;
    } catch {
      return Response.json(
        { message: 'The request body is invalid' },
        { status: 422 },
      );
    }
  }
  const headers = new Headers({ Accept: 'application/json' });
  let capability: string | undefined;
  if (route === 'access') {
    const parsed = quoteCustomerAccessSchema.safeParse(body);
    if (!parsed.success)
      return Response.json(
        { message: 'Quote is unavailable' },
        { status: 404 },
      );
    capability = parsed.data.capability;
  } else {
    capability = cookieValue(request, config.cookieName);
    if (!capability)
      return Response.json(
        { message: 'Quote is unavailable' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      );
    if (
      route === 'current/respond' &&
      !quoteCustomerResponseSchema.safeParse(body).success
    )
      return Response.json(
        { message: 'The response details are invalid' },
        { status: 422 },
      );
  }
  headers.set(capabilityHeader, capability);
  if (unsafe) {
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', config.webOrigin);
  }
  const upstreamBody =
    route === 'access'
      ? JSON.stringify({ capability })
      : unsafe
        ? JSON.stringify(body)
        : undefined;
  try {
    const upstream = await fetcher(`${config.apiUrl}/public/quotes/${route}`, {
      method: request.method,
      headers,
      body: upstreamBody,
      cache: 'no-store',
    });
    const data: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok)
      return Response.json(
        {
          message:
            upstream.status === 409
              ? 'This quote is no longer actionable'
              : 'Quote is unavailable',
        },
        {
          status: upstream.status === 409 ? 409 : 404,
          headers: {
            'Cache-Control': 'private, no-store',
            'X-Robots-Tag': 'noindex, nofollow, noarchive',
          },
        },
      );
    if (route === 'access') {
      if (
        !object(data) ||
        !exact(data, ['expiresAt']) ||
        typeof data.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(data.expiresAt))
      )
        return Response.json(
          { message: 'Quote service returned an unsafe response' },
          { status: 502 },
        );
      const response = NextResponse.json(
        { ok: true },
        {
          headers: {
            'Cache-Control': 'private, no-store',
            'Referrer-Policy': 'no-referrer',
            'X-Robots-Tag': 'noindex, nofollow, noarchive',
          },
        },
      );
      response.cookies.set(config.cookieName, capability, {
        httpOnly: true,
        expires: new Date(data.expiresAt),
        path: '/',
        sameSite: 'lax',
        secure: config.secure,
      });
      return response;
    }
    if (!isPublicQuote(data))
      return Response.json(
        { message: 'Quote service returned an unsafe response' },
        { status: 502 },
      );
    return Response.json(data, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  } catch {
    return Response.json(
      { message: 'Quote service is unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
