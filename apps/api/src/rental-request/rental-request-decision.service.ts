import { createHash } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  prisma,
  type Prisma,
  RentalRequestStatus,
  UserStatus,
} from '@mensah-rentals/database';
import type {
  AdminRentalRequestDecisionResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import type {
  ApproveRentalRequestDecisionInput,
  PartiallyApproveRentalRequestDecisionInput,
  RejectRentalRequestDecisionInput,
} from '@mensah-rentals/validation';

const decisionSelect = {
  customerExplanation: true,
  decidedAt: true,
  decidedBy: { select: { firstName: true, id: true, lastName: true } },
  id: true,
  internalReason: true,
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      approvedQuantity: true,
      id: true,
      rentalRequestRevisionItemId: true,
      requestedQuantitySnapshot: true,
    },
  },
  outcome: true,
  reviewVersionAfter: true,
  reviewVersionBefore: true,
  supersededAt: true,
} satisfies Prisma.RentalRequestDecisionSelect;

type SelectedDecision = Prisma.RentalRequestDecisionGetPayload<{
  select: typeof decisionSelect;
}>;

type DecisionInput =
  | {
      outcome: 'APPROVED';
      input: ApproveRentalRequestDecisionInput;
    }
  | {
      outcome: 'PARTIALLY_APPROVED';
      input: PartiallyApproveRentalRequestDecisionInput;
    }
  | {
      outcome: 'REJECTED';
      input: RejectRentalRequestDecisionInput;
    };

const permissionByOutcome = {
  APPROVED: 'rental_request.approve',
  PARTIALLY_APPROVED: 'rental_request.partially_approve',
  REJECTED: 'rental_request.reject',
} as const;

@Injectable()
export class RentalRequestDecisionService {
  approve(
    actor: StaffUserResponse,
    rentalRequestId: string,
    input: ApproveRentalRequestDecisionInput,
  ) {
    return this.decide(actor, rentalRequestId, { input, outcome: 'APPROVED' });
  }

  partiallyApprove(
    actor: StaffUserResponse,
    rentalRequestId: string,
    input: PartiallyApproveRentalRequestDecisionInput,
  ) {
    return this.decide(actor, rentalRequestId, {
      input,
      outcome: 'PARTIALLY_APPROVED',
    });
  }

  reject(
    actor: StaffUserResponse,
    rentalRequestId: string,
    input: RejectRentalRequestDecisionInput,
  ) {
    return this.decide(actor, rentalRequestId, { input, outcome: 'REJECTED' });
  }

  async current(
    rentalRequestId: string,
  ): Promise<AdminRentalRequestDecisionResponse | null> {
    await this.ensureRequest(rentalRequestId);
    const request = await prisma.rentalRequest.findUnique({
      where: { id: rentalRequestId },
      select: { currentRevisionId: true },
    });
    const decision = await prisma.rentalRequestDecision.findFirst({
      where: {
        rentalRequestId,
        rentalRequestRevisionId: request?.currentRevisionId ?? '__none__',
        supersededAt: null,
      },
      select: decisionSelect,
    });
    return decision ? this.map(decision) : null;
  }

  async history(
    rentalRequestId: string,
  ): Promise<AdminRentalRequestDecisionResponse[]> {
    await this.ensureRequest(rentalRequestId);
    const decisions = await prisma.rentalRequestDecision.findMany({
      where: { rentalRequestId },
      select: decisionSelect,
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
    });
    return decisions.map((decision) => this.map(decision));
  }

  private async decide(
    actor: StaffUserResponse,
    rentalRequestId: string,
    decisionInput: DecisionInput,
  ): Promise<AdminRentalRequestDecisionResponse> {
    const normalized = this.normalize(rentalRequestId, decisionInput);
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
    try {
      const decisionId = await prisma.$transaction(async (tx) => {
        await this.requireActor(tx, actor.id, [
          'rental_request.view',
          permissionByOutcome[decisionInput.outcome],
        ]);
        const request = await this.lockRequest(tx, rentalRequestId);
        const replay = await tx.rentalRequestDecision.findUnique({
          where: { operationId: decisionInput.input.operationId },
          select: {
            decidedByUserId: true,
            id: true,
            outcome: true,
            payloadHash: true,
            rentalRequestId: true,
          },
        });
        if (replay) {
          if (
            replay.decidedByUserId === actor.id &&
            replay.rentalRequestId === rentalRequestId &&
            replay.outcome === decisionInput.outcome &&
            replay.payloadHash === payloadHash
          )
            return replay.id;
          throw new ConflictException(
            'This decision operation identifier was already used differently',
          );
        }
        if (request.status !== RentalRequestStatus.UNDER_REVIEW)
          throw new ConflictException(
            'Only a request under review can receive a decision',
          );
        if (request.reviewVersion !== decisionInput.input.expectedReviewVersion)
          throw new ConflictException(
            'This request changed since it was loaded. Refresh and try again.',
          );

        const quantities = this.quantities(request.items, decisionInput);
        const reviewVersionAfter = request.reviewVersion + 1;
        const decision = await tx.rentalRequestDecision.create({
          data: {
            customerExplanation:
              decisionInput.input.customerExplanation ?? null,
            decidedByUserId: actor.id,
            internalReason: decisionInput.input.internalReason,
            operationId: decisionInput.input.operationId,
            outcome: decisionInput.outcome,
            payloadHash,
            rentalRequestId,
            rentalRequestRevisionId: request.currentRevisionId,
            reviewVersionAfter,
            reviewVersionBefore: request.reviewVersion,
            items: {
              create: request.items.map((item) => ({
                approvedQuantity: quantities.get(item.id)!,
                rentalRequestRevisionItemId: item.id,
                requestedQuantitySnapshot: item.requestedQuantity,
              })),
            },
          },
          select: { id: true },
        });
        await tx.rentalRequestActivity.create({
          data: {
            actorUserId: actor.id,
            decisionId: decision.id,
            newStatus: decisionInput.outcome,
            previousStatus: RentalRequestStatus.UNDER_REVIEW,
            rentalRequestId,
            type: decisionInput.outcome,
          },
        });
        await tx.rentalRequest.update({
          where: { id: rentalRequestId },
          data: {
            reviewVersion: reviewVersionAfter,
            status: decisionInput.outcome,
          },
        });
        return decision.id;
      });
      return this.byId(decisionId);
    } catch (error) {
      if (this.code(error) !== 'P2002') throw error;
      const replay = await prisma.$transaction(async (tx) => {
        await this.requireActor(tx, actor.id, [
          'rental_request.view',
          permissionByOutcome[decisionInput.outcome],
        ]);
        return tx.rentalRequestDecision.findUnique({
          where: { operationId: decisionInput.input.operationId },
          select: {
            decidedByUserId: true,
            id: true,
            outcome: true,
            payloadHash: true,
            rentalRequestId: true,
          },
        });
      });
      if (
        replay?.decidedByUserId === actor.id &&
        replay.rentalRequestId === rentalRequestId &&
        replay.outcome === decisionInput.outcome &&
        replay.payloadHash === payloadHash
      )
        return this.byId(replay.id);
      throw new ConflictException(
        'This request already has a decision or the operation identifier was reused',
      );
    }
  }

  private quantities(
    requestItems: Array<{ id: string; requestedQuantity: number }>,
    decisionInput: DecisionInput,
  ) {
    if (decisionInput.outcome === 'APPROVED')
      return new Map(
        requestItems.map((item) => [item.id, item.requestedQuantity]),
      );
    if (decisionInput.outcome === 'REJECTED')
      return new Map(requestItems.map((item) => [item.id, 0]));

    const submitted = new Map(
      decisionInput.input.items.map((item) => [
        item.rentalRequestItemId,
        item.approvedQuantity,
      ]),
    );
    if (
      submitted.size !== requestItems.length ||
      requestItems.some((item) => !submitted.has(item.id))
    )
      throw new UnprocessableEntityException(
        'Partial approval must include every requested item exactly once',
      );
    if (
      requestItems.some(
        (item) => submitted.get(item.id)! > item.requestedQuantity,
      )
    )
      throw new UnprocessableEntityException(
        'Approved quantity cannot exceed requested quantity',
      );
    if (
      requestItems.every(
        (item) => submitted.get(item.id) === item.requestedQuantity,
      )
    )
      throw new UnprocessableEntityException(
        'Partial approval requires at least one changed quantity',
      );
    if (requestItems.every((item) => submitted.get(item.id) === 0))
      throw new UnprocessableEntityException(
        'Partial approval requires at least one positive approved quantity',
      );
    return submitted;
  }

  private normalize(rentalRequestId: string, decisionInput: DecisionInput) {
    return {
      customerExplanation: decisionInput.input.customerExplanation ?? null,
      expectedReviewVersion: decisionInput.input.expectedReviewVersion,
      internalReason: decisionInput.input.internalReason,
      items:
        decisionInput.outcome === 'PARTIALLY_APPROVED'
          ? [...decisionInput.input.items].sort((left, right) =>
              left.rentalRequestItemId.localeCompare(right.rentalRequestItemId),
            )
          : [],
      outcome: decisionInput.outcome,
      rentalRequestId,
    };
  }

  private async lockRequest(tx: Prisma.TransactionClient, id: string) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "RentalRequest" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!locked.length) throw new NotFoundException('Rental request not found');
    const request = await tx.rentalRequest.findUniqueOrThrow({
      where: { id },
      select: {
        currentRevisionId: true,
        currentRevision: {
          select: {
            items: {
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              select: { id: true, requestedQuantity: true },
            },
          },
        },
        reviewVersion: true,
        status: true,
      },
    });
    if (!request.currentRevisionId || !request.currentRevision)
      throw new ConflictException('This request has no current revision');
    return {
      currentRevisionId: request.currentRevisionId,
      items: request.currentRevision.items,
      reviewVersion: request.reviewVersion,
      status: request.status,
    };
  }

  private async requireActor(
    tx: Prisma.TransactionClient,
    actorId: string,
    permissions: string[],
  ) {
    const actor = await tx.user.findFirst({
      where: { id: actorId, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    if (!actor) throw new ForbiddenException('Insufficient permissions');
    const granted = await tx.permission.findMany({
      where: {
        key: { in: permissions },
        roles: {
          some: { role: { users: { some: { userId: actorId } } } },
        },
      },
      select: { key: true },
    });
    const keys = new Set(granted.map(({ key }) => key));
    if (permissions.some((permission) => !keys.has(permission)))
      throw new ForbiddenException('Insufficient permissions');
  }

  private async ensureRequest(id: string) {
    const request = await prisma.rentalRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!request) throw new NotFoundException('Rental request not found');
  }

  private async byId(id: string) {
    const decision = await prisma.rentalRequestDecision.findUniqueOrThrow({
      where: { id },
      select: decisionSelect,
    });
    return this.map(decision);
  }

  private map(decision: SelectedDecision): AdminRentalRequestDecisionResponse {
    return {
      customerExplanation: decision.customerExplanation,
      decidedAt: decision.decidedAt.toISOString(),
      decidedBy: decision.decidedBy,
      id: decision.id,
      internalReason: decision.internalReason,
      items: decision.items.map(({ rentalRequestRevisionItemId, ...item }) => ({
        ...item,
        rentalRequestItemId: rentalRequestRevisionItemId,
      })),
      outcome: decision.outcome,
      quoteEligible:
        decision.outcome !== 'REJECTED' && decision.supersededAt === null,
      reviewVersionAfter: decision.reviewVersionAfter,
      reviewVersionBefore: decision.reviewVersionBefore,
    };
  }

  private code(error: unknown): string | undefined {
    return typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
      ? error.code
      : undefined;
  }
}
