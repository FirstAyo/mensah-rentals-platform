import type { PublicRentalRequestResponse } from '@mensah-rentals/types';
import type { SubmitRentalRequestInput } from '@mensah-rentals/validation';

const forbidden =
  /inventory|availability|available|remaining|reserved|reservation|stock|price|internal|staff|role|permission|password|token|hash|contact|email|phone|address|notes|cart|actor|decidedby|operation|version/i;

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
      'decision',
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
  const statuses = new Map([
    ['REQUEST_SUBMITTED', 'Request submitted'],
    ['UNDER_REVIEW', 'Under review'],
    ['APPROVED', 'Request approved'],
    ['PARTIALLY_APPROVED', 'Request partially approved'],
    ['REJECTED', 'Request not approved'],
  ]);
  if (statuses.get(String(value.status.key)) !== value.status.label)
    throw new Error('Invalid rental request status.');
  const exposesApproved =
    value.status.key === 'APPROVED' ||
    value.status.key === 'PARTIALLY_APPROVED';
  for (const item of value.items) {
    object(
      item,
      [
        'categoryName',
        'approvedQuantity',
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
    if (
      exposesApproved !== Object.hasOwn(item, 'approvedQuantity') ||
      (exposesApproved &&
        (!Number.isInteger(item.approvedQuantity) ||
          Number(item.approvedQuantity) < 0 ||
          Number(item.approvedQuantity) > Number(item.requestedQuantity)))
    )
      throw new Error('Invalid approved quantity.');
  }
  const terminal = ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'].includes(
    String(value.status.key),
  );
  if (terminal !== Boolean(value.decision))
    throw new Error('Invalid request decision.');
  if (value.decision) {
    object(
      value.decision,
      ['customerExplanation', 'decidedAt', 'notice', 'outcome'],
      'request decision',
    );
    if (value.decision.outcome !== value.status.key)
      throw new Error('Invalid request decision outcome.');
    const explanation = value.decision.customerExplanation;
    if (
      explanation !== null &&
      (typeof explanation !== 'string' ||
        explanation.length < 1 ||
        explanation.length > 2000)
    )
      throw new Error('Invalid customer decision explanation.');
    if (
      typeof value.decision.decidedAt !== 'string' ||
      Number.isNaN(Date.parse(value.decision.decidedAt))
    )
      throw new Error('Invalid decision timestamp.');
    const expectedNotice =
      value.decision.outcome === 'REJECTED'
        ? 'This decision is not a quote or final order.'
        : 'Approved quantities may be used to prepare a future custom quote. This decision is not a reservation, quote, or final order.';
    if (value.decision.notice !== expectedNotice)
      throw new Error('Invalid request decision notice.');
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
