import type { StaffUserResponse } from '@mensah-rentals/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  quoteCount,
  inventoryReservationCount,
  inventoryReservationItemFindMany,
  rentalOrderCount,
  rentalRequestCount,
  rentalRequestFindMany,
  activeRentalCount,
} = vi.hoisted(() => ({
  activeRentalCount: vi.fn(),
  quoteCount: vi.fn(),
  inventoryReservationCount: vi.fn(),
  inventoryReservationItemFindMany: vi.fn(),
  rentalOrderCount: vi.fn(),
  rentalRequestCount: vi.fn(),
  rentalRequestFindMany: vi.fn(),
}));

vi.mock('@mensah-rentals/database', () => ({
  prisma: {
    activeRental: { count: activeRentalCount },
    quote: { count: quoteCount },
    inventoryReservation: { count: inventoryReservationCount },
    inventoryReservationItem: { findMany: inventoryReservationItemFindMany },
    rentalOrder: { count: rentalOrderCount },
    rentalRequest: {
      count: rentalRequestCount,
      findMany: rentalRequestFindMany,
    },
  },
  QuoteRevisionState: {
    ACCEPTED: 'ACCEPTED',
    SENT: 'SENT',
    VIEWED: 'VIEWED',
  },
}));

import { WorkSummaryService } from './work-summary.service';

function service() {
  return new WorkSummaryService({
    adminAvailability: vi.fn().mockResolvedValue({
      features: [
        'RENTAL_REQUESTS',
        'QUOTES_AND_ORDERS',
        'RESERVATIONS',
        'FULFILMENT',
        'RETURNS',
        'DAMAGED_RETURN_HANDLING',
        'MAINTENANCE',
        'INSPECTIONS',
      ].map((key) => ({ available: true, key, testing: false })),
    }),
  } as never);
}

function actor(permissionKeys: string[]): StaffUserResponse {
  return {
    createdAt: '2026-07-27T00:00:00.000Z',
    email: 'staff@example.test',
    firstName: 'Staff',
    id: 'staff-id',
    lastLoginAt: null,
    lastName: 'Member',
    permissionKeys,
    roles: [],
    status: 'ACTIVE',
    updatedAt: '2026-07-27T00:00:00.000Z',
  };
}

describe('WorkSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps source counts into permission-visible actionable work', async () => {
    rentalRequestCount.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    rentalRequestFindMany.mockResolvedValueOnce([
      {
        currentRevision: { decision: { id: 'decision-current' } },
        quote: null,
      },
    ]);
    quoteCount.mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    rentalOrderCount.mockResolvedValueOnce(7);

    const result = await service().get(
      actor([
        'rental_request.view',
        'quote.create',
        'quote.view',
        'order.create',
        'order.view',
      ]),
    );

    expect(result).toMatchObject({
      orders: { upcomingRentalDates: 7 },
      quotes: { acceptedAwaitingOrder: 5, sentAwaitingResponse: 3 },
      rentalRequests: {
        approvedAwaitingQuote: 1,
        submittedAwaitingReview: 4,
        underReview: 2,
      },
    });
    expect(rentalRequestCount).toHaveBeenNthCalledWith(1, {
      where: { status: { in: ['SUBMITTED', 'RE_REVIEW_REQUIRED'] } },
    });
  });

  it('exposes reservation metrics only with the reservation permission', async () => {
    rentalOrderCount
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    inventoryReservationItemFindMany.mockResolvedValueOnce([
      { shortfallQuantity: 8 },
      { shortfallQuantity: 6 },
    ]);
    inventoryReservationCount.mockResolvedValueOnce(5);
    const result = await service().get(actor(['inventory.reservation.view']));
    expect(result.reservations).toEqual({
      awaitingReservation: 2,
      fullyReserved: 4,
      partiallyReserved: 3,
      unresolvedShortfallQuantity: 14,
      upcomingReservations: 5,
    });
    expect(rentalOrderCount).toHaveBeenNthCalledWith(1, {
      where: {
        rentalEndDateSnapshot: { gte: expect.any(Date) },
        reservationStatus: {
          in: ['NOT_RESERVED', 'RESERVATION_FAILED'],
        },
        OR: [
          { reservation: { is: null } },
          {
            reservation: {
              is: { coverageStatus: 'SHORTFALL_REQUIRES_PLAN' },
            },
          },
        ],
        status: 'CONFIRMED',
      },
    });
  });

  it('does not query or disclose sections without their view permission', async () => {
    await expect(service().get(actor([]))).resolves.toEqual({
      generatedAt: expect.any(String),
    });
    expect(rentalRequestCount).not.toHaveBeenCalled();
    expect(quoteCount).not.toHaveBeenCalled();
    expect(rentalOrderCount).not.toHaveBeenCalled();
    expect(inventoryReservationCount).not.toHaveBeenCalled();
  });

  it('counts due and overdue work only while a rental remains active', async () => {
    activeRentalCount
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const result = await service().get(actor(['active_rental.view']));
    expect(result.activeRentals).toEqual({
      active: 4,
      expectedReturnsToday: 2,
      overdue: 1,
    });
    for (const call of activeRentalCount.mock.calls) {
      expect(call[0].where.status).toEqual({
        in: ['PARTIALLY_ACTIVE', 'ACTIVE'],
      });
    }
  });

  it('does not disclose dashboard work for a disabled feature', async () => {
    rentalRequestCount.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    const disabled = new WorkSummaryService({
      adminAvailability: vi.fn().mockResolvedValue({
        features: [
          { available: false, key: 'RENTAL_REQUESTS', testing: false },
        ],
      }),
    } as never);
    const result = await disabled.get(actor(['rental_request.view']));
    expect(result.rentalRequests).toBeUndefined();
  });
});
