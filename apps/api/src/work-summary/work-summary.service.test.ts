import type { StaffUserResponse } from '@mensah-rentals/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { quoteCount, rentalOrderCount, rentalRequestCount } = vi.hoisted(() => ({
  quoteCount: vi.fn(),
  rentalOrderCount: vi.fn(),
  rentalRequestCount: vi.fn(),
}));

vi.mock('@mensah-rentals/database', () => ({
  prisma: {
    quote: { count: quoteCount },
    rentalOrder: { count: rentalOrderCount },
    rentalRequest: { count: rentalRequestCount },
  },
  QuoteRevisionState: {
    ACCEPTED: 'ACCEPTED',
    SENT: 'SENT',
    VIEWED: 'VIEWED',
  },
}));

import { WorkSummaryService } from './work-summary.service';

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
    rentalRequestCount
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    quoteCount.mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    rentalOrderCount.mockResolvedValueOnce(6).mockResolvedValueOnce(7);

    const result = await new WorkSummaryService().get(
      actor([
        'rental_request.view',
        'quote.create',
        'quote.view',
        'order.create',
        'order.view',
      ]),
    );

    expect(result).toMatchObject({
      orders: { confirmedNotReserved: 6, upcomingRentalDates: 7 },
      quotes: { acceptedAwaitingOrder: 5, sentAwaitingResponse: 3 },
      rentalRequests: {
        approvedAwaitingQuote: 1,
        submittedAwaitingReview: 4,
        underReview: 2,
      },
    });
    expect(rentalRequestCount).toHaveBeenNthCalledWith(1, {
      where: { status: 'SUBMITTED' },
    });
  });

  it('does not query or disclose sections without their view permission', async () => {
    await expect(new WorkSummaryService().get(actor([]))).resolves.toEqual({
      generatedAt: expect.any(String),
    });
    expect(rentalRequestCount).not.toHaveBeenCalled();
    expect(quoteCount).not.toHaveBeenCalled();
    expect(rentalOrderCount).not.toHaveBeenCalled();
  });
});
