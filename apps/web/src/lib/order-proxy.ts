import type { PublicRentalOrderResponse } from '@mensah-rentals/types';
import { orderCustomerAccessSchema } from '@mensah-rentals/validation';
import { NextResponse } from 'next/server';

import { orderConfig } from './order-config';

const capabilityHeader = 'x-order-capability';
const maxBodyBytes = 8 * 1024;
const unavailableHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};
const rootKeys = [
  'chargeTotalCents',
  'charges',
  'companyName',
  'confirmedAt',
  'currency',
  'customerName',
  'customerNotes',
  'deliveryAddress',
  'discountCents',
  'discountBaseCents',
  'discountRateBasisPoints',
  'discountType',
  'fulfillmentMethod',
  'itemSubtotalCents',
  'items',
  'notice',
  'orderNumber',
  'projectLocation',
  'projectName',
  'projectNotes',
  'projectType',
  'rentalEndDate',
  'rentalStartDate',
  'status',
  'subtotalCents',
  'tax',
  'taxableSubtotalCents',
  'taxCents',
  'terms',
  'totalCents',
  'customerFulfilmentStatus',
  'expectedReturnDate',
  'checkedOutItems',
  'returnSummary',
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
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function nullableString(value: unknown) {
  return value === null || typeof value === 'string';
}

export function isPublicRentalOrder(
  value: unknown,
): value is PublicRentalOrderResponse {
  if (!object(value) || !exact(value, rootKeys)) return false;
  if (
    value.status !== 'CONFIRMED' ||
    value.currency !== 'CAD' ||
    !['PICKUP', 'DELIVERY', 'DELIVERY_AND_SETUP'].includes(
      String(value.fulfillmentMethod),
    )
  )
    return false;
  if (
    !object(value.customerFulfilmentStatus) ||
    !exact(value.customerFulfilmentStatus, ['key', 'label']) ||
    ![
      'CONFIRMED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'READY_FOR_DELIVERY',
      'OUT_FOR_DELIVERY',
      'RENTAL_ACTIVE',
      'PARTIALLY_RECEIVED',
      'RECEIVED_REVIEWING',
      'ISSUE_UNDER_REVIEW',
      'COMPLETED',
    ].includes(String(value.customerFulfilmentStatus.key)) ||
    typeof value.customerFulfilmentStatus.label !== 'string' ||
    !nullableString(value.expectedReturnDate) ||
    !Array.isArray(value.checkedOutItems) ||
    !value.checkedOutItems.every(
      (entry) =>
        object(entry) &&
        exact(entry, ['productName', 'quantity', 'rentalUnit']) &&
        typeof entry.productName === 'string' &&
        nonNegativeInteger(entry.quantity) &&
        typeof entry.rentalUnit === 'string',
    )
  )
    return false;
  if (
    value.returnSummary !== null &&
    (!object(value.returnSummary) ||
      !exact(value.returnSummary, [
        'customerSafeMessage',
        'outstandingQuantity',
        'returnedQuantity',
        'status',
      ]) ||
      typeof value.returnSummary.customerSafeMessage !== 'string' ||
      !nonNegativeInteger(value.returnSummary.outstandingQuantity) ||
      !nonNegativeInteger(value.returnSummary.returnedQuantity) ||
      ![
        'PARTIALLY_RECEIVED',
        'RECEIVED_REVIEWING',
        'ISSUE_UNDER_REVIEW',
        'COMPLETED',
      ].includes(String(value.returnSummary.status)))
  )
    return false;
  if (
    !['FIXED_AMOUNT', 'PERCENTAGE'].includes(String(value.discountType)) ||
    !nonNegativeInteger(value.discountBaseCents) ||
    !(
      value.discountRateBasisPoints === null ||
      nonNegativeInteger(value.discountRateBasisPoints)
    )
  )
    return false;
  if (
    ![
      value.customerName,
      value.notice,
      value.orderNumber,
      value.projectLocation,
      value.projectName,
      value.projectType,
      value.rentalStartDate,
      value.rentalEndDate,
    ].every((entry) => typeof entry === 'string') ||
    !Number.isFinite(Date.parse(String(value.confirmedAt))) ||
    ![
      value.companyName,
      value.customerNotes,
      value.deliveryAddress,
      value.projectNotes,
      value.terms,
    ].every(nullableString)
  )
    return false;
  if (
    ![
      value.itemSubtotalCents,
      value.chargeTotalCents,
      value.subtotalCents,
      value.discountCents,
      value.taxableSubtotalCents,
      value.taxCents,
      value.totalCents,
    ].every(nonNegativeInteger)
  )
    return false;
  if (
    !Array.isArray(value.items) ||
    !value.items.every(
      (entry) =>
        object(entry) &&
        exact(entry, itemKeys) &&
        nonNegativeInteger(entry.approvedQuantity) &&
        nonNegativeInteger(entry.quotedQuantity) &&
        nonNegativeInteger(entry.unitPriceCents) &&
        nonNegativeInteger(entry.lineSubtotalCents) &&
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
        nonNegativeInteger(entry.amountCents) &&
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
    nonNegativeInteger(value.tax.rateBasisPoints) &&
    nonNegativeInteger(value.tax.taxableAmountCents) &&
    nonNegativeInteger(value.tax.taxAmountCents)
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

function unavailable(status = 404) {
  return Response.json(
    { message: 'Order is unavailable' },
    { status, headers: unavailableHeaders },
  );
}

export async function proxyOrder(
  request: Request,
  path: string[],
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const config = orderConfig();
  const joined = path.join('/');
  const route =
    joined === '' && request.method === 'GET'
      ? 'current'
      : joined === 'access' && request.method === 'POST'
        ? 'access'
        : joined === 'view' && request.method === 'POST'
          ? 'current/view'
          : joined === 'pdf' && request.method === 'GET'
            ? 'current/pdf'
            : null;
  if (!route)
    return Response.json({ message: 'Order route not found' }, { status: 404 });

  let capability: string | undefined;
  let upstreamBody: string | undefined;
  if (route === 'access' || route === 'current/view') {
    if (request.headers.get('origin') !== config.webOrigin)
      return Response.json(
        { message: 'Request origin is not allowed' },
        { status: 403 },
      );
    if (
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
    const declaredLength = request.headers.get('content-length');
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBodyBytes)
    )
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
      );
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBodyBytes)
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
      );
    let body: unknown;
    try {
      body = JSON.parse(text || '{}') as unknown;
    } catch {
      return unavailable();
    }
    if (route === 'access') {
      const parsed = orderCustomerAccessSchema.safeParse(body);
      if (!parsed.success) return unavailable();
      capability = parsed.data.capability;
      upstreamBody = JSON.stringify({ capability });
    } else {
      capability = cookieValue(request, config.cookieName);
      if (!capability || !object(body) || Object.keys(body).length !== 0)
        return unavailable();
      upstreamBody = '{}';
    }
  } else {
    capability = cookieValue(request, config.cookieName);
    if (!capability) return unavailable();
  }

  if (!capability) return unavailable();

  const headers = new Headers({
    Accept: 'application/json',
    [capabilityHeader]: capability,
  });
  if (route === 'access' || route === 'current/view') {
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', config.webOrigin);
  }

  try {
    const upstream = await fetcher(`${config.apiUrl}/public/orders/${route}`, {
      method: request.method,
      headers,
      body: upstreamBody,
      cache: 'no-store',
    });
    if (route === 'current/pdf') {
      const contentType = upstream.headers
        .get('content-type')
        ?.split(';', 1)[0]
        ?.trim()
        .toLowerCase();
      if (!upstream.ok || contentType !== 'application/pdf')
        return unavailable(upstream.ok ? 502 : 404);
      const disposition = upstream.headers.get('content-disposition');
      return new Response(upstream.body, {
        status: 200,
        headers: {
          ...unavailableHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition':
            disposition &&
            /^attachment; filename="[A-Za-z0-9._-]+"$/.test(disposition)
              ? disposition
              : 'attachment; filename="mensah-rentals-order.pdf"',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    const data: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) return unavailable();

    if (route === 'access') {
      if (
        !object(data) ||
        !exact(data, ['expiresAt']) ||
        typeof data.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(data.expiresAt))
      )
        return Response.json(
          { message: 'Order service returned an unsafe response' },
          { status: 502, headers: unavailableHeaders },
        );
      const response = NextResponse.json(
        { ok: true },
        { headers: unavailableHeaders },
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

    if (!isPublicRentalOrder(data))
      return Response.json(
        { message: 'Order service returned an unsafe response' },
        { status: 502, headers: unavailableHeaders },
      );
    return Response.json(data, { headers: unavailableHeaders });
  } catch {
    return Response.json(
      { message: 'Order service is unavailable' },
      { status: 503, headers: unavailableHeaders },
    );
  }
}
