import type { PublicContactEnquiryReceiptResponse } from '@mensah-rentals/types';

import { PRIVATE_RESPONSE_HEADERS } from './private-response';

const MAX_BODY_BYTES = 8 * 1024;

function safeReceipt(
  value: unknown,
): PublicContactEnquiryReceiptResponse | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    record.accepted !== true ||
    typeof record.message !== 'string' ||
    (record.referenceNumber !== null &&
      typeof record.referenceNumber !== 'string')
  )
    return null;
  return {
    accepted: true,
    message: record.message,
    referenceNumber: record.referenceNumber as string | null,
  };
}

export async function proxyContactEnquiry(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
  if (request.method !== 'POST')
    return Response.json(
      { message: 'Contact route not found' },
      { status: 404, headers: PRIVATE_RESPONSE_HEADERS },
    );
  if (request.headers.get('origin') !== webOrigin)
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403, headers: PRIVATE_RESPONSE_HEADERS },
    );
  const contentType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== 'application/json')
    return Response.json(
      { message: 'JSON requests are required' },
      { status: 415, headers: PRIVATE_RESPONSE_HEADERS },
    );
  const declaredLength = request.headers.get('content-length');
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)
  )
    return Response.json(
      { message: 'Contact enquiry is too large' },
      { status: 413, headers: PRIVATE_RESPONSE_HEADERS },
    );
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES)
    return Response.json(
      { message: 'Contact enquiry is too large' },
      { status: 413, headers: PRIVATE_RESPONSE_HEADERS },
    );
  try {
    const upstream = await fetcher(`${apiUrl}/public/contact-enquiries`, {
      body,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: webOrigin,
      },
      method: 'POST',
    });
    const value: unknown = await upstream.json().catch(() => null);
    if (upstream.ok) {
      const receipt = safeReceipt(value);
      if (!receipt)
        return Response.json(
          { message: 'Contact service returned an unsafe response' },
          { status: 502, headers: PRIVATE_RESPONSE_HEADERS },
        );
      return Response.json(receipt, {
        status: upstream.status,
        headers: PRIVATE_RESPONSE_HEADERS,
      });
    }
    const message =
      upstream.status === 429
        ? 'Too many contact enquiries. Please try again later.'
        : upstream.status === 400
          ? 'Please check the contact form and try again.'
          : 'Your enquiry could not be submitted. Please try again.';
    return Response.json(
      { message },
      { status: upstream.status, headers: PRIVATE_RESPONSE_HEADERS },
    );
  } catch {
    return Response.json(
      { message: 'The contact service is temporarily unavailable.' },
      { status: 503, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}
