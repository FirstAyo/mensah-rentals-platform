import type { PublicRentalRequestResponse } from '@mensah-rentals/types';
import type { SubmitRentalRequestInput } from '@mensah-rentals/validation';

const forbidden =
  /inventory|availability|available|remaining|reserved|reservation|stock|price|approved|internal|staff|role|permission|password|token|hash|contact|email|phone|address|notes|cart|customer/i;

function object(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid ${label} response.`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error(`Unsafe ${label} response.`);
}

function safe(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(safe);
  if (value && typeof value === 'object')
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.test(key))
        throw new Error('Unsafe rental request response.');
      safe(nested);
    }
}

export function assertRentalRequestResponse(
  value: unknown,
): asserts value is PublicRentalRequestResponse {
  safe(value);
  object(
    value,
    [
      'fulfillmentMethod',
      'items',
      'projectName',
      'referenceNumber',
      'rentalEndDate',
      'rentalStartDate',
      'status',
      'submittedAt',
    ],
    'rental request',
  );
  if (!Array.isArray(value.items))
    throw new Error('Invalid rental request response.');
  object(value.status, ['key', 'label'], 'request status');
  if (
    value.status.key !== 'REQUEST_SUBMITTED' ||
    value.status.label !== 'Request submitted'
  )
    throw new Error('Invalid rental request status.');
  for (const item of value.items) {
    object(
      item,
      [
        'categoryName',
        'categorySlug',
        'productName',
        'productSlug',
        'rentalUnit',
        'requestedQuantity',
      ],
      'rental request item',
    );
    if (!Number.isInteger(item.requestedQuantity))
      throw new Error('Invalid requested quantity.');
  }
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/rental-requests${path}`, {
    ...init,
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'The rental request could not be completed.';
    throw new Error(message);
  }
  assertRentalRequestResponse(body);
  return body;
}

export const submitRentalRequest = (input: SubmitRentalRequestInput) =>
  request('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

export const trackRentalRequest = (referenceNumber: string) =>
  request(`/${encodeURIComponent(referenceNumber)}`);
