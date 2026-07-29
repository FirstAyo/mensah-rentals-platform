import { Injectable } from '@nestjs/common';
import { prisma, QuoteRevisionState } from '@mensah-rentals/database';
import type {
  AdminWorkSummaryResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';

@Injectable()
export class WorkSummaryService {
  async get(actor: StaffUserResponse): Promise<AdminWorkSummaryResponse> {
    const permissions = new Set(actor.permissionKeys);
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const response: AdminWorkSummaryResponse = {
      generatedAt: now.toISOString(),
    };

    if (permissions.has('rental_request.view')) {
      const [submittedAwaitingReview, underReview, approvedCandidates] =
        await Promise.all([
          prisma.rentalRequest.count({
            where: { status: { in: ['SUBMITTED', 'RE_REVIEW_REQUIRED'] } },
          }),
          prisma.rentalRequest.count({ where: { status: 'UNDER_REVIEW' } }),
          permissions.has('quote.create')
            ? prisma.rentalRequest.findMany({
                where: {
                  status: { in: ['APPROVED', 'PARTIALLY_APPROVED'] },
                  currentRevision: {
                    is: { decision: { is: { supersededAt: null } } },
                  },
                },
                select: {
                  currentRevision: {
                    select: {
                      decision: {
                        select: { id: true },
                      },
                    },
                  },
                  quote: {
                    select: {
                      revisions: {
                        select: { rentalRequestDecisionId: true },
                      },
                    },
                  },
                },
              })
            : Promise.resolve([]),
        ]);
      const approvedAwaitingQuote = approvedCandidates.filter((request) => {
        const decisionId = request.currentRevision?.decision?.id;
        return (
          decisionId &&
          !request.quote?.revisions.some(
            (revision) => revision.rentalRequestDecisionId === decisionId,
          )
        );
      }).length;
      response.rentalRequests = {
        submittedAwaitingReview,
        underReview,
        ...(permissions.has('quote.create') ? { approvedAwaitingQuote } : {}),
      };
    }

    if (permissions.has('quote.view')) {
      const [sentAwaitingResponse, acceptedAwaitingOrder] = await Promise.all([
        prisma.quote.count({
          where: {
            customerRevision: {
              is: {
                validUntil: { gt: now },
                lifecycle: {
                  is: {
                    state: {
                      in: [QuoteRevisionState.SENT, QuoteRevisionState.VIEWED],
                    },
                  },
                },
                customerAccess: {
                  some: {
                    revokedAt: null,
                    expiresAt: { gt: now },
                  },
                },
              },
            },
          },
        }),
        permissions.has('order.create')
          ? prisma.quote.count({
              where: {
                rentalOrder: { is: null },
                customerRevision: {
                  is: {
                    lifecycle: {
                      is: { state: QuoteRevisionState.ACCEPTED },
                    },
                  },
                },
              },
            })
          : Promise.resolve(0),
      ]);
      response.quotes = {
        sentAwaitingResponse,
        ...(permissions.has('order.create') ? { acceptedAwaitingOrder } : {}),
      };
    }

    if (permissions.has('order.view')) {
      const upcomingRentalDates = await prisma.rentalOrder.count({
        where: {
          status: 'CONFIRMED',
          rentalStartDateSnapshot: { gte: todayUtc },
        },
      });
      response.orders = { upcomingRentalDates };
    }

    if (permissions.has('inventory.reservation.view')) {
      const [
        awaitingReservation,
        partiallyReserved,
        fullyReserved,
        shortfall,
        upcomingReservations,
      ] = await Promise.all([
        prisma.rentalOrder.count({
          where: {
            status: 'CONFIRMED',
            reservationStatus: {
              in: ['NOT_RESERVED', 'RESERVATION_FAILED'],
            },
            rentalEndDateSnapshot: { gte: todayUtc },
          },
        }),
        prisma.rentalOrder.count({
          where: {
            status: 'CONFIRMED',
            reservationStatus: 'PARTIALLY_RESERVED',
          },
        }),
        prisma.rentalOrder.count({
          where: { status: 'CONFIRMED', reservationStatus: 'RESERVED' },
        }),
        prisma.inventoryReservationItem.aggregate({
          where: {
            inventoryReservation: { status: 'PARTIALLY_RESERVED' },
          },
          _sum: { shortfallQuantity: true },
        }),
        prisma.inventoryReservation.count({
          where: {
            status: { in: ['PARTIALLY_RESERVED', 'RESERVED'] },
            rentalStartDateSnapshot: { gte: todayUtc },
          },
        }),
      ]);
      response.reservations = {
        awaitingReservation,
        fullyReserved,
        partiallyReserved,
        unresolvedShortfallQuantity: shortfall._sum.shortfallQuantity ?? 0,
        upcomingReservations,
      };
    }

    if (permissions.has('fulfilment.view')) {
      const [
        awaitingPreparation,
        preparing,
        readyForPickup,
        readyForDelivery,
        partiallyCheckedOut,
      ] = await Promise.all([
        prisma.rentalOrder.count({
          where: {
            status: 'CONFIRMED',
            reservationStatus: {
              in: ['PARTIALLY_RESERVED', 'RESERVED', 'PARTIALLY_CONSUMED'],
            },
            fulfilment: { is: null },
          },
        }),
        prisma.orderFulfilment.count({ where: { status: 'PREPARING' } }),
        prisma.orderFulfilment.count({
          where: { status: 'READY', fulfilmentMethod: 'PICKUP' },
        }),
        prisma.orderFulfilment.count({
          where: {
            status: 'READY',
            fulfilmentMethod: { in: ['DELIVERY', 'DELIVERY_AND_SETUP'] },
          },
        }),
        prisma.orderFulfilment.count({
          where: { status: 'PARTIALLY_CHECKED_OUT' },
        }),
      ]);
      response.fulfilment = {
        awaitingPreparation,
        preparing,
        readyForPickup,
        readyForDelivery,
        partiallyCheckedOut,
      };
    }

    if (permissions.has('active_rental.view')) {
      const tomorrowUtc = new Date(todayUtc);
      tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);
      const [active, expectedReturnsToday, overdue] = await Promise.all([
        prisma.activeRental.count({
          where: { status: { in: ['PARTIALLY_ACTIVE', 'ACTIVE'] } },
        }),
        prisma.activeRental.count({
          where: {
            expectedReturnAt: { gte: todayUtc, lt: tomorrowUtc },
            status: { in: ['PARTIALLY_ACTIVE', 'ACTIVE'] },
          },
        }),
        prisma.activeRental.count({
          where: {
            expectedReturnAt: { lt: now },
            status: { in: ['PARTIALLY_ACTIVE', 'ACTIVE'] },
          },
        }),
      ]);
      response.activeRentals = { active, expectedReturnsToday, overdue };
    }

    if (permissions.has('return.view')) {
      const [partiallyReturned, awaitingReconciliation, readyToComplete] =
        await Promise.all([
          prisma.rentalReturn.count({
            where: { status: 'PARTIALLY_RETURNED' },
          }),
          prisma.rentalReturn.count({
            where: { status: 'RECONCILIATION_REQUIRED' },
          }),
          prisma.rentalReturn.count({ where: { status: 'READY_TO_COMPLETE' } }),
        ]);
      response.returns = {
        partiallyReturned,
        awaitingReconciliation,
        readyToComplete,
      };
    }

    if (permissions.has('rental_issue.view')) {
      const [missing, damaged, unresolved] = await Promise.all([
        prisma.rentalIssue.count({
          where: { type: 'MISSING', status: { not: 'RESOLVED' } },
        }),
        prisma.rentalIssue.count({
          where: { type: 'DAMAGED', status: { not: 'RESOLVED' } },
        }),
        prisma.rentalIssue.count({ where: { status: { not: 'RESOLVED' } } }),
      ]);
      response.returnIssues = { damaged, missing, unresolved };
    }

    return response;
  }
}
