import type {
  AdminInventoryReservationResponse,
  AdminOrderAvailabilityResponse,
  AdminReservationErrorResponse,
  AdminReservationShortageItemResponse,
  RentalOrderReservationStatusResponse,
} from '@mensah-rentals/types';

export interface ReservationPreview {
  fullReservationPossible: boolean;
  items: AdminReservationShortageItemResponse[];
  missingTotal: number;
  reservableNowTotal: number;
}

export function buildReservationPreview(
  availability: AdminOrderAvailabilityResponse,
  reservation: AdminInventoryReservationResponse | null,
): ReservationPreview {
  const items = availability.items.map((item) => {
    const existing = reservation?.items.find(
      (candidate) => candidate.rentalOrderItemId === item.rentalOrderItemId,
    );
    const alreadyReservedQuantity = existing?.reservedQuantity ?? 0;
    const remaining = Math.max(
      0,
      item.orderedQuantity - alreadyReservedQuantity,
    );
    const currentlyAvailableQuantity = Math.max(0, item.availableToReserve);
    const quantityCanBeReservedNow = Math.min(
      remaining,
      currentlyAvailableQuantity,
    );
    const missingQuantity = Math.max(0, remaining - quantityCanBeReservedNow);
    return {
      alreadyReservedQuantity,
      currentlyAvailableQuantity,
      missingQuantity,
      orderedQuantity: item.orderedQuantity,
      productName: item.productName,
      quantityCanBeReservedNow,
      rentalOrderItemId: item.rentalOrderItemId,
      serializedAssetShortage:
        item.trackingMode === 'SERIALIZED' ? missingQuantity : null,
      trackingMode: item.trackingMode,
    } satisfies AdminReservationShortageItemResponse;
  });
  return {
    fullReservationPossible: items.every((item) => item.missingQuantity === 0),
    items,
    missingTotal: items.reduce((sum, item) => sum + item.missingQuantity, 0),
    reservableNowTotal: items.reduce(
      (sum, item) => sum + item.quantityCanBeReservedNow,
      0,
    ),
  };
}

const statusLabels: Record<RentalOrderReservationStatusResponse, string> = {
  CONSUMED: 'Reserved inventory consumed',
  NOT_RESERVED: 'Not reserved',
  PARTIALLY_CONSUMED: 'Partially consumed',
  PARTIALLY_RESERVED: 'Partially reserved',
  RELEASED: 'Released',
  RESERVATION_FAILED: 'Reservation failed',
  RESERVED: 'Reserved',
};

export function reservationStatusLabel(
  status: RentalOrderReservationStatusResponse,
) {
  return statusLabels[status];
}

function shortageItems(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items: AdminReservationShortageItemResponse[] = [];
  const isQuantity = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 0;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return undefined;
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.rentalOrderItemId !== 'string' ||
      typeof item.productName !== 'string' ||
      typeof item.orderedQuantity !== 'number' ||
      typeof item.alreadyReservedQuantity !== 'number' ||
      typeof item.currentlyAvailableQuantity !== 'number' ||
      typeof item.quantityCanBeReservedNow !== 'number' ||
      typeof item.missingQuantity !== 'number' ||
      ![
        item.orderedQuantity,
        item.alreadyReservedQuantity,
        item.currentlyAvailableQuantity,
        item.quantityCanBeReservedNow,
        item.missingQuantity,
      ].every(isQuantity) ||
      !(
        item.serializedAssetShortage === null ||
        isQuantity(item.serializedAssetShortage)
      ) ||
      !(
        item.trackingMode === null ||
        item.trackingMode === 'BULK' ||
        item.trackingMode === 'SERIALIZED'
      )
    )
      return undefined;
    items.push({
      alreadyReservedQuantity: item.alreadyReservedQuantity,
      currentlyAvailableQuantity: item.currentlyAvailableQuantity,
      missingQuantity: item.missingQuantity,
      orderedQuantity: item.orderedQuantity,
      productName: item.productName,
      quantityCanBeReservedNow: item.quantityCanBeReservedNow,
      rentalOrderItemId: item.rentalOrderItemId,
      serializedAssetShortage: item.serializedAssetShortage as number | null,
      trackingMode: item.trackingMode,
    });
  }
  return items;
}

export function mapReservationApiError(status: number, body: unknown) {
  const error =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Partial<AdminReservationErrorResponse>)
      : {};
  if (error.code === 'FULL_RESERVATION_UNAVAILABLE')
    return {
      code: error.code,
      items: shortageItems(error.items),
      message:
        'Full reservation is not currently possible. Review the exact shortfall and reserve the available quantity if permitted.',
    };
  if (error.code === 'ORDER_CHANGE_REQUEST_PENDING')
    return {
      code: error.code,
      message:
        'This order cannot be reserved while a formal change request is unresolved.',
    };
  if (error.code === 'ORDER_NOT_CONFIRMED')
    return {
      code: error.code,
      message: 'Only a confirmed rental order can be reserved.',
    };
  if (error.code === 'RESERVATION_ALREADY_EXISTS')
    return {
      code: error.code,
      message:
        'A reservation record now exists for this order. Refresh and review its current status.',
    };
  if (error.code === 'OPERATION_CONFLICT')
    return {
      code: error.code,
      message:
        'This action conflicts with an earlier submission. Refresh and review the latest reservation.',
    };
  if (error.code === 'RESERVATION_STALE' || status === 409)
    return {
      code: error.code,
      message:
        'Reservation data changed while this page was open. Refresh and review the latest values.',
    };
  if (error.code === 'MISSING_OVERRIDE_REASON')
    return {
      code: error.code,
      message: 'Enter an internal reason for the partial reservation.',
    };
  if (status === 403)
    return {
      code: error.code,
      message: 'You do not have permission to perform this reservation action.',
    };
  if (status === 422)
    return {
      code: error.code,
      message:
        error.code === 'INVALID_RENTAL_DATES'
          ? 'The order rental dates must be corrected before inventory can be reserved.'
          : 'Review the reservation quantities, reason, and serialized asset selections.',
    };
  return {
    code: error.code,
    message: 'The reservation action could not be completed. Please try again.',
  };
}
