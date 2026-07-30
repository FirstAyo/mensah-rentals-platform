import type {
  PublicRentalRequestResponse,
  PublicRentalRequestRevisionResponse,
} from '@mensah-rentals/types';
import type {
  SubmitRentalRequestAmendmentInput,
  SubmitRentalChangeRequestInput,
  SubmitRentalRequestInput,
} from '@mensah-rentals/validation';

import { friendlyAmendmentSubmissionError } from './amendment-form';

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

function responseString(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new Error('Invalid string response.');
}

function responseNullableString(value: unknown): void {
  if (value !== null) responseString(value);
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
      'currentRevisionNumber',
      'amendmentAllowed',
      'formalChangeRequestAllowed',
    ],
    'rental request',
  );
  if (!Array.isArray(value.items))
    throw new Error('Invalid rental request response.');
  object(value.status, ['key', 'label'], 'request status');
  const statuses = new Map([
    ['REQUEST_SUBMITTED', 'Request submitted'],
    ['RE_REVIEW_REQUIRED', 'Changes awaiting review'],
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

export function assertRentalRequestRevisionResponse(
  value: unknown,
): asserts value is PublicRentalRequestRevisionResponse {
  object(
    value,
    [
      'amendmentReason',
      'amendmentAllowed',
      'companyName',
      'contactEmail',
      'contactFirstName',
      'contactLastName',
      'contactPhone',
      'customerNotes',
      'createdAt',
      'deliveryAddress',
      'formalChangeRequestAllowed',
      'fulfillmentMethod',
      'id',
      'items',
      'projectLocation',
      'projectName',
      'projectType',
      'referenceNumber',
      'rentalEndDate',
      'rentalStartDate',
      'requestedTimeZone',
      'revisionNumber',
      'status',
    ],
    'rental request revision',
  );
  const requiredKeys = [
    'amendmentReason',
    'amendmentAllowed',
    'companyName',
    'contactEmail',
    'contactFirstName',
    'contactLastName',
    'contactPhone',
    'customerNotes',
    'createdAt',
    'deliveryAddress',
    'formalChangeRequestAllowed',
    'fulfillmentMethod',
    'id',
    'items',
    'projectLocation',
    'projectName',
    'projectType',
    'referenceNumber',
    'rentalEndDate',
    'rentalStartDate',
    'requestedTimeZone',
    'revisionNumber',
    'status',
  ];
  if (requiredKeys.some((key) => !Object.hasOwn(value, key)))
    throw new Error('Incomplete rental request revision response.');
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
    'referenceNumber',
    'rentalEndDate',
    'rentalStartDate',
    'requestedTimeZone',
  ])
    responseString(value[key]);
  for (const key of [
    'amendmentReason',
    'companyName',
    'customerNotes',
    'deliveryAddress',
  ])
    responseNullableString(value[key]);
  if (
    typeof value.amendmentAllowed !== 'boolean' ||
    typeof value.formalChangeRequestAllowed !== 'boolean' ||
    !Number.isInteger(value.revisionNumber) ||
    Number(value.revisionNumber) < 1
  )
    throw new Error('Invalid rental request revision metadata.');
  if (!Array.isArray(value.items) || value.items.length < 1)
    throw new Error('Invalid rental request revision items.');
  for (const item of value.items) {
    object(
      item,
      [
        'categoryName',
        'categorySlug',
        'id',
        'productId',
        'productName',
        'productSlug',
        'rentalUnit',
        'requestedQuantity',
        'sortOrder',
      ],
      'rental request revision item',
    );
    for (const key of [
      'categoryName',
      'categorySlug',
      'id',
      'productName',
      'productSlug',
      'rentalUnit',
    ])
      responseString(item[key]);
    responseNullableString(item.productId);
    if (
      !Number.isInteger(item.requestedQuantity) ||
      Number(item.requestedQuantity) < 1 ||
      !Number.isInteger(item.sortOrder) ||
      Number(item.sortOrder) < 0
    )
      throw new Error('Invalid rental request revision item metadata.');
  }
  object(value.status, ['key', 'label'], 'request status');
  responseString(value.status.key);
  responseString(value.status.label);
}

export function assertRentalRequestRevisionListResponse(
  value: unknown,
): asserts value is PublicRentalRequestRevisionResponse[] {
  if (!Array.isArray(value))
    throw new Error('Invalid rental request revision list.');
  for (const revision of value) assertRentalRequestRevisionResponse(revision);
}

export function assertRentalRequestCatalogueResponse(value: unknown): void {
  object(value, ['items'], 'rental request catalogue');
  if (!Array.isArray(value.items))
    throw new Error('Invalid rental request catalogue items.');
  for (const item of value.items) {
    object(
      item,
      ['category', 'id', 'image', 'name', 'rentalUnit', 'slug'],
      'rental request catalogue item',
    );
    for (const key of ['id', 'name', 'rentalUnit', 'slug'])
      responseString(item[key]);
    object(item.category, ['name', 'slug'], 'catalogue category');
    responseString(item.category.name);
    responseString(item.category.slug);
    if (item.image !== null) {
      object(item.image, ['altText', 'url'], 'catalogue image');
      responseString(item.image.altText);
      responseString(item.image.url);
    }
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

export async function currentRentalRequestRevision() {
  const response = await fetch('/api/rental-requests/current/revision', {
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error('This request is not available.');
  assertRentalRequestRevisionResponse(body);
  return body;
}

export async function submitRentalRequestAmendment(
  input: SubmitRentalRequestAmendmentInput,
) {
  const response = await fetch('/api/rental-requests/current/amendments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(friendlyAmendmentSubmissionError(response.status));
  assertRentalRequestRevisionResponse(body);
  return body;
}

export async function submitRentalChangeRequest(
  input: SubmitRentalChangeRequestInput,
) {
  const response = await fetch('/api/change-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'The formal change request could not be submitted.';
    throw new Error(message);
  }
  return body;
}
