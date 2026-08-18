import { NextResponse } from 'next/server';

import { rentalRequestConfig } from './rental-request-config';
import { PRIVATE_RESPONSE_HEADERS } from './private-response';

const ACCESS_HEADER = 'x-rental-request-token';
const ACCESS_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function exactObject(value: unknown, keys: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid change request response.');
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !allowed.has(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error('Unsafe change request response.');
}

function string(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new Error('Invalid string response.');
}

function nullableString(value: unknown): void {
  if (value !== null) string(value);
}

function nullablePositiveInteger(value: unknown): void {
  if (value !== null && (!Number.isInteger(value) || Number(value) < 1))
    throw new Error('Invalid quantity response.');
}

function oneOf(value: unknown, allowed: readonly string[]): void {
  string(value);
  if (!allowed.includes(value)) throw new Error('Invalid enum response.');
}

function assertPublicChangeRequest(value: unknown): void {
  exactObject(value, [
    'companyName',
    'contactEmail',
    'contactFirstName',
    'contactLastName',
    'contactPhone',
    'createdAt',
    'customerNotes',
    'deliveryAddress',
    'fulfillmentMethod',
    'id',
    'items',
    'projectLocation',
    'projectName',
    'projectType',
    'reason',
    'rentalEndDate',
    'rentalStartDate',
    'requestedTimeZone',
    'source',
    'status',
  ]);
  const response = value as Record<string, unknown>;
  for (const key of [
    'contactEmail',
    'contactFirstName',
    'contactLastName',
    'contactPhone',
    'createdAt',
    'fulfillmentMethod',
    'id',
    'projectLocation',
    'projectName',
    'projectType',
    'reason',
    'rentalEndDate',
    'rentalStartDate',
    'requestedTimeZone',
    'source',
    'status',
  ])
    string(response[key]);
  for (const key of ['companyName', 'customerNotes', 'deliveryAddress'])
    nullableString(response[key]);
  oneOf(response.fulfillmentMethod, [
    'PICKUP',
    'DELIVERY',
    'DELIVERY_AND_SETUP',
  ]);
  oneOf(response.source, ['ACCEPTED_QUOTE', 'CONFIRMED_ORDER']);
  oneOf(response.status, [
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED_FOR_REQUOTE',
    'REJECTED',
    'WITHDRAWN',
    'SUPERSEDED',
  ]);
  const items = response.items;
  if (!Array.isArray(items)) throw new Error('Invalid change request items.');
  for (const item of items) {
    exactObject(item, [
      'categoryName',
      'categorySlug',
      'changeType',
      'id',
      'previousQuantity',
      'productId',
      'productName',
      'productSlug',
      'proposedQuantity',
      'rentalUnit',
      'requestedQuantity',
      'sortOrder',
    ]);
    const entry = item as Record<string, unknown>;
    for (const key of [
      'categoryName',
      'categorySlug',
      'changeType',
      'id',
      'productName',
      'productSlug',
      'rentalUnit',
    ])
      string(entry[key]);
    nullableString(entry.productId);
    oneOf(entry.changeType, [
      'ADDED',
      'REMOVED',
      'QUANTITY_CHANGED',
      'UNCHANGED',
    ]);
    nullablePositiveInteger(entry.previousQuantity);
    nullablePositiveInteger(entry.proposedQuantity);
    if (!Number.isInteger(entry.requestedQuantity))
      throw new Error('Invalid requested quantity response.');
    if (!Number.isInteger(entry.sortOrder) || Number(entry.sortOrder) < 0)
      throw new Error('Invalid sort order response.');
  }
}

function assertPublicChangeRequestBody(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertPublicChangeRequest(entry);
    return;
  }
  assertPublicChangeRequest(value);
}

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function target(path: string[], method: string): string | null {
  if (path.length === 0 && method === 'POST')
    return '/public/rental-change-requests';
  if (path.length === 0 && method === 'GET')
    return '/public/rental-change-requests/current';
  if (
    path.length === 1 &&
    /^[a-z0-9]{20,32}$/i.test(path[0] ?? '') &&
    method === 'GET'
  )
    return `/public/rental-change-requests/${encodeURIComponent(path[0]!)}`;
  return null;
}

export async function proxyRentalChangeRequest(
  request: Request,
  path: string[],
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const config = rentalRequestConfig();
  const upstreamPath = target(path, request.method);
  if (!upstreamPath)
    return Response.json(
      { message: 'Change request route not found' },
      { status: 404, headers: PRIVATE_RESPONSE_HEADERS },
    );
  if (request.method === 'POST') {
    const mediaType = request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (request.headers.get('origin') !== config.webOrigin)
      return Response.json(
        { message: 'Request origin is not allowed' },
        { status: 403, headers: PRIVATE_RESPONSE_HEADERS },
      );
    if (mediaType !== 'application/json')
      return Response.json(
        { message: 'JSON requests are required' },
        { status: 415, headers: PRIVATE_RESPONSE_HEADERS },
      );
  }
  const headers = new Headers({ Accept: 'application/json' });
  const capability = cookieValue(request, config.requestCookieName);
  if (capability && ACCESS_PATTERN.test(capability))
    headers.set(ACCESS_HEADER, capability);
  let body: string | undefined;
  if (request.method === 'POST') {
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 48 * 1024)
      return Response.json(
        { message: 'Change request is too large' },
        { status: 413, headers: PRIVATE_RESPONSE_HEADERS },
      );
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', config.webOrigin);
  }
  try {
    const upstream = await fetcher(`${config.apiUrl}${upstreamPath}`, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
    const upstreamBody: unknown = await upstream.json().catch(() => null);
    if (upstream.ok) {
      try {
        assertPublicChangeRequestBody(upstreamBody);
      } catch {
        return Response.json(
          { message: 'Change request service returned an unsafe response' },
          { status: 502, headers: PRIVATE_RESPONSE_HEADERS },
        );
      }
    }
    return NextResponse.json(
      upstream.ok
        ? upstreamBody
        : {
            message:
              upstream.status === 404
                ? 'Change request not found.'
                : upstream.status === 409
                  ? 'The request changed. Refresh and try again.'
                  : 'The change request could not be completed.',
          },
      {
        status: upstream.status,
        headers: PRIVATE_RESPONSE_HEADERS,
      },
    );
  } catch {
    return Response.json(
      { message: 'Change request service is unavailable' },
      { status: 503, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}
