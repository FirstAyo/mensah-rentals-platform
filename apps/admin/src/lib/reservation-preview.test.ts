import { describe, expect, it } from 'vitest';
import type { AdminOrderAvailabilityResponse } from '@mensah-rentals/types';

import {
  buildReservationPreview,
  mapReservationApiError,
  reservationStatusLabel,
} from './reservation-preview';

const availability = (availableToReserve: number, trackingMode = 'BULK') =>
  ({
    calculatedAt: new Date().toISOString(),
    items: [
      {
        availableToReserve,
        eligibleSerializedAssetCount:
          trackingMode === 'SERIALIZED' ? availableToReserve : null,
        inventoryId: 'inventory-1',
        orderedQuantity: 100,
        overlappingReservedQuantity: 0,
        physicalRentableQuantity: availableToReserve,
        productId: 'product-1',
        productName: 'Folding Chair',
        rentalOrderItemId: 'order-item-1',
        shortfallQuantity: Math.max(0, 100 - availableToReserve),
        trackingMode,
      },
    ],
    notice: 'Internal only',
    orderId: 'order-1',
    rentalEndDate: '2026-09-11',
    rentalStartDate: '2026-09-10',
    requestedTimeZone: 'America/Toronto',
  }) as AdminOrderAvailabilityResponse;

describe('reservation preview', () => {
  it('shows exact full, partial, and zero-availability quantities', () => {
    expect(buildReservationPreview(availability(100), null)).toMatchObject({
      fullReservationPossible: true,
      missingTotal: 0,
      reservableNowTotal: 100,
    });
    expect(
      buildReservationPreview(availability(80), null).items[0],
    ).toMatchObject({
      alreadyReservedQuantity: 0,
      currentlyAvailableQuantity: 80,
      missingQuantity: 20,
      orderedQuantity: 100,
      quantityCanBeReservedNow: 80,
    });
    expect(buildReservationPreview(availability(0), null)).toMatchObject({
      fullReservationPossible: false,
      missingTotal: 100,
      reservableNowTotal: 0,
    });
  });

  it('reports a serialized shortage separately', () => {
    expect(
      buildReservationPreview(availability(3, 'SERIALIZED'), null).items[0],
    ).toMatchObject({ missingQuantity: 97, serializedAssetShortage: 97 });
  });

  it('maps safe statuses and structured errors without raw server text', () => {
    expect(reservationStatusLabel('NOT_RESERVED')).toBe('Not reserved');
    expect(reservationStatusLabel('RESERVATION_FAILED')).toBe(
      'Reservation failed',
    );
    expect(
      mapReservationApiError(422, {
        message: 'raw database or Zod details',
      }).message,
    ).not.toMatch(/database|Zod/i);
  });

  it('allowlists structured shortage fields and strips internal details', () => {
    const mapped = mapReservationApiError(409, {
      code: 'FULL_RESERVATION_UNAVAILABLE',
      items: [
        {
          alreadyReservedQuantity: 20,
          currentlyAvailableQuantity: 60,
          internalInventoryId: 'must-not-reach-the-component',
          missingQuantity: 20,
          orderedQuantity: 100,
          productName: 'Folding Chair',
          quantityCanBeReservedNow: 60,
          rentalOrderItemId: 'order-item-1',
          serializedAssetShortage: null,
          trackingMode: 'BULK',
        },
      ],
      message: 'database detail',
    });
    expect(mapped.items?.[0]).toEqual({
      alreadyReservedQuantity: 20,
      currentlyAvailableQuantity: 60,
      missingQuantity: 20,
      orderedQuantity: 100,
      productName: 'Folding Chair',
      quantityCanBeReservedNow: 60,
      rentalOrderItemId: 'order-item-1',
      serializedAssetShortage: null,
      trackingMode: 'BULK',
    });
    expect(mapped.message).not.toMatch(/database/i);
    expect(
      mapReservationApiError(409, {
        code: 'OPERATION_CONFLICT',
        message: 'raw operation detail',
      }).message,
    ).toMatch(/earlier submission/i);
    expect(
      mapReservationApiError(409, {
        code: 'RESERVATION_STALE',
        message: 'raw row version',
      }).message,
    ).toMatch(/changed while this page was open/i);
  });
});
