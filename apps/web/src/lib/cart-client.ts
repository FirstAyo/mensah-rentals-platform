import type { PublicCartResponse } from '@mensah-rentals/types';

const forbidden =
  /inventory|totalQuantity|availableQuantity|remainingQuantity|reservedQuantity|rentedQuantity|damagedQuantity|maintenanceQuantity|lostQuantity|availability|stock|assetNumber|serialNumber|transaction|reservation|price|staff|role|permission|password|token/i;

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
      if (forbidden.test(key)) throw new Error('Unsafe rental cart response.');
      safe(nested);
    }
}

export function assertCartResponse(
  value: unknown,
): asserts value is PublicCartResponse {
  safe(value);
  object(
    value,
    ['desiredUnitCount', 'distinctItemCount', 'items'],
    'rental cart',
  );
  if (
    !Number.isInteger(value.desiredUnitCount) ||
    !Number.isInteger(value.distinctItemCount) ||
    !Array.isArray(value.items)
  )
    throw new Error('Invalid rental cart response.');
  for (const item of value.items) {
    object(item, ['desiredQuantity', 'product'], 'cart item');
    if (!Number.isInteger(item.desiredQuantity))
      throw new Error('Invalid cart item response.');
    object(
      item.product,
      [
        'category',
        'image',
        'name',
        'rentalUnit',
        'requestable',
        'shortDescription',
        'slug',
      ],
      'cart product',
    );
    object(item.product.category, ['name', 'slug'], 'cart category');
    if (item.product.image !== null) {
      object(item.product.image, ['altText', 'isPrimary', 'url'], 'cart image');
      if (
        typeof item.product.image.url !== 'string' ||
        !item.product.image.url.startsWith('/media/products/')
      )
        throw new Error('Unsafe cart image response.');
    }
  }
}

async function cartRequest(path = '', init?: RequestInit) {
  const method = (init?.method ?? 'GET').toUpperCase();
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const response = await fetch(`/api/cart${path}`, {
    ...init,
    cache: 'no-store',
    headers: isMutation ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'The rental cart could not be updated.';
    throw new Error(message);
  }
  assertCartResponse(body);
  return body;
}

export const getCart = () => cartRequest();
export const setCartItem = (productSlug: string, desiredQuantity: number) =>
  cartRequest(`/items/${encodeURIComponent(productSlug)}`, {
    method: 'PUT',
    body: JSON.stringify({ desiredQuantity }),
  });
export const removeCartItem = (productSlug: string) =>
  cartRequest(`/items/${encodeURIComponent(productSlug)}`, {
    method: 'DELETE',
    body: '{}',
  });
export const clearCart = () =>
  cartRequest('', { method: 'DELETE', body: '{}' });
