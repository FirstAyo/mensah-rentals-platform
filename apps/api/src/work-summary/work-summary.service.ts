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
      const [confirmedNotReserved, upcomingRentalDates] = await Promise.all([
        prisma.rentalOrder.count({
          where: { status: 'CONFIRMED', reservationStatus: 'NOT_RESERVED' },
        }),
        prisma.rentalOrder.count({
          where: {
            status: 'CONFIRMED',
            rentalStartDateSnapshot: { gte: todayUtc },
          },
        }),
      ]);
      response.orders = { confirmedNotReserved, upcomingRentalDates };
    }

    return response;
  }
}
