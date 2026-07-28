import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashSessionToken } from '@mensah-rentals/auth';
import {
  prisma,
  Prisma,
  QuoteRevisionState,
  RentalRequestStatus,
} from '@mensah-rentals/database';
import type {
  PublicRentalRequestResponse,
  PublicRentalRequestRevisionResponse,
  PublicRentalRequestStatus,
} from '@mensah-rentals/types';
import {
  customerDecisionExplanationSchema,
  rentalRequestReferenceSchema,
  type ApiEnvironment,
  type SubmitRentalRequestAmendmentInput,
  type SubmitRentalRequestInput,
} from '@mensah-rentals/validation';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const revisionSelect = {
  amendmentReason: true,
  companyName: true,
  contactEmail: true,
  contactFirstName: true,
  contactLastName: true,
  contactPhone: true,
  createdAt: true,
  customerNotes: true,
  deliveryAddress: true,
  fulfillmentMethod: true,
  id: true,
  items: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    select: {
      categoryNameSnapshot: true,
      categorySlugSnapshot: true,
      id: true,
      productId: true,
      productNameSnapshot: true,
      productSlugSnapshot: true,
      rentalUnitSnapshot: true,
      requestedQuantity: true,
      sortOrder: true,
    },
  },
  projectLocation: true,
  projectName: true,
  projectType: true,
  rentalEndDate: true,
  rentalStartDate: true,
  requestedTimeZone: true,
  revisionNumber: true,
  submittedByType: true,
} satisfies Prisma.RentalRequestRevisionSelect;

const requestSelect = {
  currentRevision: {
    select: {
      ...revisionSelect,
      decision: {
        select: {
          customerExplanation: true,
          decidedAt: true,
          outcome: true,
          supersededAt: true,
          items: {
            select: {
              approvedQuantity: true,
              rentalRequestRevisionItemId: true,
            },
          },
        },
      },
    },
  },
  fulfillmentMethod: true,
  id: true,
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { productId: 'asc' as const }],
    select: {
      categoryName: true,
      categorySlug: true,
      id: true,
      productName: true,
      productSlug: true,
      rentalUnit: true,
      requestedQuantity: true,
    },
  },
  projectName: true,
  referenceNumber: true,
  rentalEndDate: true,
  rentalOrder: { select: { id: true } },
  rentalStartDate: true,
  quote: {
    select: {
      customerRevision: {
        select: { lifecycle: { select: { state: true } } },
      },
    },
  },
  status: true,
  submittedAt: true,
} satisfies Prisma.RentalRequestSelect;

type SelectedRequest = Prisma.RentalRequestGetPayload<{
  select: typeof requestSelect;
}>;
type SelectedRevision = Prisma.RentalRequestRevisionGetPayload<{
  select: typeof revisionSelect;
}>;

export interface RentalRequestOperationResult {
  expiresAt?: Date;
  rawRequestToken?: string;
  request: PublicRentalRequestResponse;
}

@Injectable()
export class PublicRentalRequestService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  async submit(
    rawCartToken: string | undefined,
    rawRequestToken: string | undefined,
    input: SubmitRentalRequestInput,
  ): Promise<RentalRequestOperationResult> {
    if (!rawCartToken || !TOKEN_PATTERN.test(rawCartToken))
      throw new UnprocessableEntityException(
        'Your rental cart is unavailable. Please review it and try again.',
      );
    const sourceCartTokenHash = hashSessionToken(rawCartToken);
    const submissionKeyHash = hashSessionToken(input.submissionId);
    const submissionPayloadHash = hashSessionToken(JSON.stringify(input));
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.rentalRequest.findFirst({
        where: { OR: [{ submissionKeyHash }, { sourceCartTokenHash }] },
        select: {
          id: true,
          sourceCartTokenHash: true,
          submissionPayloadHash: true,
          guestSession: { select: { expiresAt: true } },
          customerAccess: {
            where: { revokedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
            select: { expiresAt: true, id: true },
            take: 1,
          },
        },
      });
      if (replay) {
        if (
          replay.sourceCartTokenHash === sourceCartTokenHash &&
          replay.submissionPayloadHash === submissionPayloadHash &&
          (!replay.guestSession || replay.guestSession.expiresAt <= new Date())
        )
          throw new ConflictException(
            'This submission can no longer be replayed.',
          );
        if (
          replay.sourceCartTokenHash !== sourceCartTokenHash ||
          replay.submissionPayloadHash !== submissionPayloadHash ||
          !replay.customerAccess[0]
        )
          throw new ConflictException(
            'This submission identifier has already been used.',
          );
        return {
          accessId: replay.customerAccess[0].id,
          expiresAt: replay.customerAccess[0].expiresAt,
          requestId: replay.id,
        };
      }

      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Cart"
        WHERE "tokenHash" = ${sourceCartTokenHash} AND "expiresAt" > CURRENT_TIMESTAMP
        FOR UPDATE
      `;
      const cartId = locked[0]?.id;
      if (!cartId) {
        const committed = await tx.rentalRequest.findUnique({
          where: { sourceCartTokenHash },
          select: {
            id: true,
            submissionPayloadHash: true,
            guestSession: { select: { expiresAt: true } },
            customerAccess: {
              where: { revokedAt: null, expiresAt: { gt: new Date() } },
              orderBy: { createdAt: 'desc' },
              select: { expiresAt: true, id: true },
              take: 1,
            },
          },
        });
        if (
          committed?.submissionPayloadHash === submissionPayloadHash &&
          committed.guestSession?.expiresAt &&
          committed.guestSession.expiresAt > new Date() &&
          committed.customerAccess[0]
        )
          return {
            accessId: committed.customerAccess[0].id,
            expiresAt: committed.customerAccess[0].expiresAt,
            requestId: committed.id,
          };
        throw new UnprocessableEntityException(
          'Your rental cart is unavailable. Please review it and try again.',
        );
      }
      const cart = await tx.cart.findUniqueOrThrow({
        where: { id: cartId },
        select: {
          items: {
            orderBy: [{ createdAt: 'asc' }, { productId: 'asc' }],
            select: {
              desiredQuantity: true,
              product: {
                select: {
                  category: {
                    select: { isActive: true, name: true, slug: true },
                  },
                  id: true,
                  images: {
                    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                    select: { url: true },
                    take: 1,
                  },
                  isActive: true,
                  name: true,
                  rentalUnit: true,
                  slug: true,
                },
              },
            },
          },
        },
      });
      if (!cart.items.length)
        throw new UnprocessableEntityException(
          'Add at least one listed product before submitting a request.',
        );
      if (
        cart.items.some(
          ({ product }) => !product.isActive || !product.category.isActive,
        )
      )
        throw new UnprocessableEntityException(
          'Your cart contains a product that is no longer listed. Please review it.',
        );

      const session = await this.resolveSession(tx, rawRequestToken);
      const request = await tx.rentalRequest.create({
        data: {
          referenceNumber: await this.reference(tx),
          submissionKeyHash,
          submissionPayloadHash,
          sourceCartTokenHash,
          guestSessionId: session.id,
          ...this.requestFields(input),
          items: {
            create: cart.items.map(({ desiredQuantity, product }) => ({
              productId: product.id,
              requestedQuantity: desiredQuantity,
              productName: product.name,
              productSlug: product.slug,
              categoryName: product.category.name,
              categorySlug: product.category.slug,
              rentalUnit: product.rentalUnit,
            })),
          },
        },
        select: { id: true },
      });
      const access = await this.createAccess(tx, request.id);
      const revision = await tx.rentalRequestRevision.create({
        data: {
          rentalRequestId: request.id,
          revisionNumber: 1,
          submittedByType: 'ORIGINAL_SUBMISSION',
          operationId: input.submissionId,
          payloadHash: submissionPayloadHash,
          ...this.requestFields(input),
          items: {
            create: cart.items.map(({ desiredQuantity, product }, index) => ({
              productId: product.id,
              productNameSnapshot: product.name,
              productSlugSnapshot: product.slug,
              categoryNameSnapshot: product.category.name,
              categorySlugSnapshot: product.category.slug,
              rentalUnitSnapshot: product.rentalUnit,
              primaryImageUrlSnapshot: product.images[0]?.url ?? null,
              requestedQuantity: desiredQuantity,
              sortOrder: index,
            })),
          },
        },
        select: { id: true },
      });
      await tx.rentalRequest.update({
        where: { id: request.id },
        data: { currentRevisionId: revision.id },
      });
      await tx.cart.delete({ where: { id: cartId } });
      return {
        accessId: access.id,
        expiresAt: access.expiresAt,
        requestId: request.id,
      };
    });
    const request = await this.byId(result.requestId);
    return {
      expiresAt: result.expiresAt,
      rawRequestToken: this.accessToken(result.accessId),
      request: this.map(request),
    };
  }

  async track(
    rawRequestToken: string | undefined,
    rawReference: string,
  ): Promise<RentalRequestOperationResult> {
    const parsedReference =
      rentalRequestReferenceSchema.safeParse(rawReference);
    const reference = parsedReference.success
      ? parsedReference.data
      : 'MR-0000-INVALID0000';
    const tokenHash = hashSessionToken(
      rawRequestToken && TOKEN_PATTERN.test(rawRequestToken)
        ? rawRequestToken
        : 'invalid-request-capability',
    );
    const now = new Date();
    const direct = await prisma.rentalRequestCustomerAccess.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: now },
        revokedAt: null,
        rentalRequest: { referenceNumber: reference },
      },
      select: { expiresAt: true, id: true, rentalRequestId: true },
    });
    if (direct) {
      await prisma.rentalRequestCustomerAccess.update({
        where: { id: direct.id },
        data: { lastUsedAt: now },
      });
      return { request: this.map(await this.byId(direct.rentalRequestId)) };
    }

    const legacy = await prisma.rentalRequest.findFirst({
      where: {
        referenceNumber: reference,
        guestSession: { tokenHash, expiresAt: { gt: now } },
      },
      select: { id: true },
    });
    if (!legacy)
      throw new NotFoundException('Rental request could not be found.');
    const exchanged = await prisma.$transaction((tx) =>
      this.createAccess(tx, legacy.id),
    );
    return {
      expiresAt: exchanged.expiresAt,
      rawRequestToken: this.accessToken(exchanged.id),
      request: this.map(await this.byId(legacy.id)),
    };
  }

  async currentRevision(
    rawToken?: string,
  ): Promise<PublicRentalRequestRevisionResponse> {
    const access = await this.requireAccess(rawToken);
    const request = await prisma.rentalRequest.findUniqueOrThrow({
      where: { id: access.rentalRequestId },
      select: {
        currentRevision: { select: revisionSelect },
        referenceNumber: true,
        status: true,
        rentalOrder: { select: { id: true } },
        quote: {
          select: {
            customerRevision: {
              select: { lifecycle: { select: { state: true } } },
            },
          },
        },
      },
    });
    if (!request.currentRevision) throw this.unavailable();
    return this.mapRevision(
      request.currentRevision,
      request.referenceNumber,
      request.status,
      this.eligibility(request),
    );
  }

  async amendments(
    rawToken?: string,
  ): Promise<PublicRentalRequestRevisionResponse[]> {
    const access = await this.requireAccess(rawToken);
    const request = await prisma.rentalRequest.findUniqueOrThrow({
      where: { id: access.rentalRequestId },
      select: {
        referenceNumber: true,
        status: true,
        rentalOrder: { select: { id: true } },
        quote: {
          select: {
            customerRevision: {
              select: { lifecycle: { select: { state: true } } },
            },
          },
        },
        revisions: {
          where: { revisionNumber: { gt: 1 } },
          orderBy: { revisionNumber: 'desc' },
          select: revisionSelect,
        },
      },
    });
    const eligibility = this.eligibility(request);
    return request.revisions.map((revision) =>
      this.mapRevision(
        revision,
        request.referenceNumber,
        request.status,
        eligibility,
      ),
    );
  }

  async amendment(rawToken: string | undefined, amendmentId: string) {
    const access = await this.requireAccess(rawToken);
    const amendment = await prisma.rentalRequestAmendment.findFirst({
      where: { id: amendmentId, rentalRequestId: access.rentalRequestId },
      select: {
        newRevision: { select: revisionSelect },
        rentalRequest: {
          select: {
            referenceNumber: true,
            status: true,
            rentalOrder: { select: { id: true } },
            quote: {
              select: {
                customerRevision: {
                  select: { lifecycle: { select: { state: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!amendment) throw this.unavailable();
    return this.mapRevision(
      amendment.newRevision,
      amendment.rentalRequest.referenceNumber,
      amendment.rentalRequest.status,
      this.eligibility(amendment.rentalRequest),
    );
  }

  async submitAmendment(
    rawToken: string | undefined,
    input: SubmitRentalRequestAmendmentInput,
  ) {
    const access = await this.requireAccess(rawToken);
    const payloadHash = hashSessionToken(JSON.stringify(input));
    const amendmentId = await this.serializable(async (tx) => {
      await this.lockRequest(tx, access.rentalRequestId);
      await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Quote"
          WHERE "rentalRequestId" = ${access.rentalRequestId}
          FOR UPDATE
        `;
      const replay = await tx.rentalRequestAmendment.findUnique({
        where: { operationId: input.operationId },
        select: {
          id: true,
          payloadHash: true,
          rentalRequestId: true,
          submittedByCustomerAccessId: true,
        },
      });
      if (replay) {
        if (
          replay.payloadHash === payloadHash &&
          replay.rentalRequestId === access.rentalRequestId &&
          replay.submittedByCustomerAccessId === access.id
        )
          return replay.id;
        throw new ConflictException(
          'This operation identifier was already used differently.',
        );
      }
      const request = await tx.rentalRequest.findUniqueOrThrow({
        where: { id: access.rentalRequestId },
        select: {
          currentRevision: {
            select: {
              id: true,
              revisionNumber: true,
              decision: { select: { id: true, supersededAt: true } },
            },
          },
          currentRevisionId: true,
          status: true,
          rentalOrder: { select: { id: true } },
          quote: {
            select: {
              id: true,
              customerRevision: {
                select: { id: true, lifecycle: { select: { state: true } } },
              },
              latestRevision: {
                select: { id: true, lifecycle: { select: { state: true } } },
              },
            },
          },
        },
      });
      if (
        !request.currentRevision ||
        request.currentRevision.revisionNumber !== input.expectedRevisionNumber
      )
        throw new ConflictException(
          'This request changed since it was loaded. Refresh and try again.',
        );
      if (!this.eligibility(request).amendmentAllowed)
        throw new ConflictException(
          'This request now requires a formal change request.',
        );
      const products = await this.replacementProducts(
        tx,
        input.items,
        request.currentRevisionId!,
      );
      const newRevision = await tx.rentalRequestRevision.create({
        data: {
          rentalRequestId: access.rentalRequestId,
          revisionNumber: request.currentRevision.revisionNumber + 1,
          submittedByType: 'CUSTOMER',
          submittedByCustomerAccessId: access.id,
          amendmentReason: input.amendmentReason,
          operationId: input.operationId,
          payloadHash,
          ...this.requestFields(input),
          items: {
            create: input.items.map((item, index) =>
              this.revisionItem(
                products.get(item.productId)!,
                item.requestedQuantity,
                index,
              ),
            ),
          },
        },
        select: { id: true },
      });
      const amendment = await tx.rentalRequestAmendment.create({
        data: {
          rentalRequestId: access.rentalRequestId,
          baseRevisionId: request.currentRevision.id,
          newRevisionId: newRevision.id,
          submittedByCustomerAccessId: access.id,
          operationId: input.operationId,
          payloadHash,
        },
        select: { id: true },
      });
      const now = new Date();
      if (
        request.currentRevision.decision &&
        !request.currentRevision.decision.supersededAt
      ) {
        await tx.rentalRequestDecision.update({
          where: { id: request.currentRevision.decision.id },
          data: { supersededAt: now, supersededByRevisionId: newRevision.id },
        });
        await tx.rentalRequestActivity.create({
          data: {
            rentalRequestId: access.rentalRequestId,
            type: 'DECISION_SUPERSEDED',
            revisionId: newRevision.id,
          },
        });
      }
      for (const quote of request.quote ? [request.quote] : []) {
        const revisions = [quote.latestRevision, quote.customerRevision].filter(
          (value, index, all) =>
            value && all.findIndex((entry) => entry?.id === value.id) === index,
        );
        for (const revision of revisions) {
          if (
            !revision?.lifecycle ||
            !new Set<QuoteRevisionState>([
              QuoteRevisionState.DRAFT,
              QuoteRevisionState.SENT,
              QuoteRevisionState.VIEWED,
            ]).has(revision.lifecycle.state)
          )
            continue;
          await tx.quoteRevisionLifecycle.update({
            where: { quoteRevisionId: revision.id },
            data: {
              state: QuoteRevisionState.SUPERSEDED,
              terminalAt: now,
              lifecycleVersion: { increment: 1 },
            },
          });
          const revoked = await tx.quoteCustomerAccess.updateMany({
            where: { quoteRevisionId: revision.id, revokedAt: null },
            data: { revokedAt: now },
          });
          await tx.quoteActivity.create({
            data: {
              quoteId: quote.id,
              quoteRevisionId: revision.id,
              type: 'QUOTE_SUPERSEDED',
            },
          });
          await tx.rentalRequestActivity.create({
            data: {
              rentalRequestId: access.rentalRequestId,
              revisionId: newRevision.id,
              type: 'QUOTE_SUPERSEDED',
            },
          });
          if (revoked.count > 0)
            await tx.rentalRequestActivity.create({
              data: {
                rentalRequestId: access.rentalRequestId,
                revisionId: newRevision.id,
                type: 'QUOTE_ACCESS_REVOKED',
              },
            });
        }
      }
      await tx.rentalRequest.update({
        where: { id: access.rentalRequestId },
        data: {
          currentRevisionId: newRevision.id,
          status: RentalRequestStatus.RE_REVIEW_REQUIRED,
          reviewStartedAt: null,
          reviewVersion: { increment: 1 },
        },
      });
      await tx.rentalRequestActivity.create({
        data: {
          rentalRequestId: access.rentalRequestId,
          type: 'AMENDMENT_SUBMITTED',
          previousStatus: request.status,
          newStatus: RentalRequestStatus.RE_REVIEW_REQUIRED,
          revisionId: newRevision.id,
        },
      });
      return amendment.id;
    });
    return this.amendment(rawToken, amendmentId);
  }

  async catalogue(rawToken: string | undefined, search?: string) {
    await this.requireAccess(rawToken);
    const normalized = search?.trim().slice(0, 100);
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        category: { isActive: true },
        ...(normalized
          ? {
              OR: [
                { name: { contains: normalized, mode: 'insensitive' } },
                {
                  category: {
                    name: { contains: normalized, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        rentalUnit: true,
        category: { select: { name: true, slug: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { url: true, altText: true },
        },
      },
    });
    return {
      items: products.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        rentalUnit: product.rentalUnit,
        category: product.category,
        image: product.images[0] ?? null,
      })),
    };
  }

  private async requireAccess(rawToken?: string) {
    const tokenHash = hashSessionToken(
      rawToken && TOKEN_PATTERN.test(rawToken)
        ? rawToken
        : 'invalid-request-capability',
    );
    const access = await prisma.rentalRequestCustomerAccess.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, rentalRequestId: true },
    });
    if (!access) throw this.unavailable();
    await prisma.rentalRequestCustomerAccess.update({
      where: { id: access.id },
      data: { lastUsedAt: new Date() },
    });
    return access;
  }

  private unavailable() {
    return new NotFoundException('Rental request could not be found.');
  }

  private eligibility(request: {
    rentalOrder: { id: string } | null;
    quote: {
      customerRevision: {
        lifecycle: { state: QuoteRevisionState } | null;
      } | null;
    } | null;
  }) {
    const accepted =
      request.quote?.customerRevision?.lifecycle?.state ===
      QuoteRevisionState.ACCEPTED;
    return {
      amendmentAllowed: !request.rentalOrder && !accepted,
      formalChangeRequestAllowed: Boolean(request.rentalOrder || accepted),
    };
  }

  private async replacementProducts(
    tx: Prisma.TransactionClient,
    items: Array<{ productId: string; requestedQuantity: number }>,
    currentRevisionId: string,
  ) {
    const ids = items.map(({ productId }) => productId);
    const products = await tx.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        isActive: true,
        name: true,
        slug: true,
        rentalUnit: true,
        category: { select: { isActive: true, name: true, slug: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { url: true },
        },
      },
    });
    const historical = new Set(
      (
        await tx.rentalRequestRevisionItem.findMany({
          where: {
            rentalRequestRevisionId: currentRevisionId,
            productId: { in: ids },
          },
          select: { productId: true },
        })
      ).map(({ productId }) => productId),
    );
    if (
      products.length !== ids.length ||
      products.some(
        (product) =>
          (!product.isActive || !product.category.isActive) &&
          !historical.has(product.id),
      )
    )
      throw new UnprocessableEntityException(
        'One or more newly added products are no longer listed.',
      );
    return new Map(products.map((product) => [product.id, product]));
  }

  private revisionItem(
    product: {
      id: string;
      name: string;
      slug: string;
      rentalUnit: string;
      category: { name: string; slug: string };
      images: Array<{ url: string }>;
    },
    quantity: number,
    index: number,
  ) {
    return {
      productId: product.id,
      productNameSnapshot: product.name,
      productSlugSnapshot: product.slug,
      categoryNameSnapshot: product.category.name,
      categorySlugSnapshot: product.category.slug,
      rentalUnitSnapshot: product.rentalUnit,
      primaryImageUrlSnapshot: product.images[0]?.url ?? null,
      requestedQuantity: quantity,
      sortOrder: index,
    };
  }

  private requestFields(input: Omit<SubmitRentalRequestInput, 'submissionId'>) {
    return {
      fulfillmentMethod: input.fulfillmentMethod,
      contactFirstName: input.contactFirstName,
      contactLastName: input.contactLastName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      companyName: input.companyName,
      projectName: input.projectName,
      projectType: input.projectType,
      projectLocation: input.projectLocation,
      deliveryAddress: input.deliveryAddress,
      rentalStartDate: this.date(input.rentalStartDate),
      rentalEndDate: this.date(input.rentalEndDate),
      requestedTimeZone: input.requestedTimeZone,
      customerNotes: input.customerNotes,
    };
  }

  private async resolveSession(
    tx: Prisma.TransactionClient,
    rawToken?: string,
  ) {
    if (rawToken && TOKEN_PATTERN.test(rawToken)) {
      const existing = await tx.guestRequestSession.findFirst({
        where: {
          tokenHash: hashSessionToken(rawToken),
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (existing) {
        const expiresAt = this.expiry();
        await tx.guestRequestSession.update({
          where: { id: existing.id },
          data: { expiresAt },
        });
        return { id: existing.id };
      }
    }
    const id = randomUUID();
    const raw = this.sessionToken(id);
    await tx.guestRequestSession.create({
      data: { id, tokenHash: hashSessionToken(raw), expiresAt: this.expiry() },
    });
    return { id };
  }

  private async createAccess(
    tx: Prisma.TransactionClient,
    rentalRequestId: string,
  ) {
    const id = randomUUID();
    const expiresAt = this.expiry();
    await tx.rentalRequestCustomerAccess.create({
      data: {
        id,
        rentalRequestId,
        tokenHash: hashSessionToken(this.accessToken(id)),
        expiresAt,
      },
    });
    return { expiresAt, id };
  }

  private async byId(id: string) {
    return prisma.rentalRequest.findUniqueOrThrow({
      where: { id },
      select: requestSelect,
    });
  }

  private async lockRequest(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "RentalRequest" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) throw this.unavailable();
  }

  private async serializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'P2002' || error.code === 'P2034')
      )
        throw new ConflictException(
          'This request changed while the amendment was submitted. Refresh and try again.',
        );
      throw error;
    }
  }

  private async reference(tx: Prisma.TransactionClient) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = Array.from(randomBytes(10), (byte) =>
        REFERENCE_ALPHABET.charAt(byte % REFERENCE_ALPHABET.length),
      )
        .join('')
        .slice(0, 10);
      const value = `MR-${new Date().getUTCFullYear()}-${suffix}`;
      if (
        !(await tx.rentalRequest.findUnique({
          where: { referenceNumber: value },
          select: { id: true },
        }))
      )
        return value;
    }
    throw new ConflictException('A request reference could not be generated.');
  }

  private sessionToken(id: string) {
    return createHmac(
      'sha256',
      this.config.get('PUBLIC_REQUEST_TRACKING_SECRET', { infer: true }),
    )
      .update(id)
      .digest('base64url');
  }
  private accessToken(id: string) {
    return createHmac(
      'sha256',
      this.config.get('PUBLIC_REQUEST_TRACKING_SECRET', { infer: true }),
    )
      .update(`request:${id}`)
      .digest('base64url');
  }
  private expiry() {
    return new Date(
      Date.now() +
        this.config.get('PUBLIC_REQUEST_TRACKING_TTL_DAYS', { infer: true }) *
          86_400_000,
    );
  }
  private date(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private mapRevision(
    revision: SelectedRevision,
    referenceNumber: string,
    status: RentalRequestStatus,
    eligibility: {
      amendmentAllowed: boolean;
      formalChangeRequestAllowed: boolean;
    },
  ): PublicRentalRequestRevisionResponse {
    return {
      ...eligibility,
      amendmentReason: revision.amendmentReason,
      companyName: revision.companyName,
      contactEmail: revision.contactEmail,
      contactFirstName: revision.contactFirstName,
      contactLastName: revision.contactLastName,
      contactPhone: revision.contactPhone,
      customerNotes: revision.customerNotes,
      createdAt: revision.createdAt.toISOString(),
      deliveryAddress: revision.deliveryAddress,
      fulfillmentMethod: revision.fulfillmentMethod,
      id: revision.id,
      items: revision.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productNameSnapshot,
        productSlug: item.productSlugSnapshot,
        categoryName: item.categoryNameSnapshot,
        categorySlug: item.categorySlugSnapshot,
        rentalUnit: item.rentalUnitSnapshot,
        requestedQuantity: item.requestedQuantity,
        sortOrder: item.sortOrder,
      })),
      projectLocation: revision.projectLocation,
      projectName: revision.projectName,
      projectType: revision.projectType,
      referenceNumber,
      rentalEndDate: revision.rentalEndDate.toISOString().slice(0, 10),
      rentalStartDate: revision.rentalStartDate.toISOString().slice(0, 10),
      requestedTimeZone: revision.requestedTimeZone,
      revisionNumber: revision.revisionNumber,
      status: this.publicStatus(status),
    };
  }

  private map(request: SelectedRequest): PublicRentalRequestResponse {
    const eligibility = this.eligibility(request);
    const revision = request.currentRevision;
    const decision =
      revision?.decision && !revision.decision.supersededAt
        ? revision.decision
        : null;
    const approved = new Map(
      decision?.items.map((item) => [
        item.rentalRequestRevisionItemId,
        item.approvedQuantity,
      ]) ?? [],
    );
    const exposesApproved =
      request.status === 'APPROVED' || request.status === 'PARTIALLY_APPROVED';
    const safe = decision?.customerExplanation
      ? customerDecisionExplanationSchema.safeParse(
          decision.customerExplanation,
        )
      : null;
    return {
      decision: decision
        ? {
            customerExplanation: safe?.success
              ? safe.data
              : decision.customerExplanation
                ? 'Please contact Mensah Rentals for an update about your request.'
                : null,
            decidedAt: decision.decidedAt.toISOString(),
            notice:
              decision.outcome === 'REJECTED'
                ? 'This decision is not a quote or final order.'
                : 'Approved quantities may be used to prepare a future custom quote. This decision is not a reservation, quote, or final order.',
            outcome: decision.outcome,
          }
        : null,
      fulfillmentMethod:
        revision?.fulfillmentMethod ?? request.fulfillmentMethod,
      items: revision
        ? revision.items.map((item) => ({
            categoryName: item.categoryNameSnapshot,
            categorySlug: item.categorySlugSnapshot,
            productName: item.productNameSnapshot,
            productSlug: item.productSlugSnapshot,
            rentalUnit: item.rentalUnitSnapshot,
            requestedQuantity: item.requestedQuantity,
            ...(exposesApproved
              ? { approvedQuantity: approved.get(item.id) }
              : {}),
          }))
        : request.items.map((item) => ({
            categoryName: item.categoryName,
            categorySlug: item.categorySlug,
            productName: item.productName,
            productSlug: item.productSlug,
            rentalUnit: item.rentalUnit,
            requestedQuantity: item.requestedQuantity,
          })),
      projectName: revision?.projectName ?? request.projectName,
      referenceNumber: request.referenceNumber,
      rentalEndDate: (revision?.rentalEndDate ?? request.rentalEndDate)
        .toISOString()
        .slice(0, 10),
      rentalStartDate: (revision?.rentalStartDate ?? request.rentalStartDate)
        .toISOString()
        .slice(0, 10),
      status: this.publicStatus(request.status),
      submittedAt: request.submittedAt.toISOString(),
      currentRevisionNumber: revision?.revisionNumber,
      amendmentAllowed: eligibility.amendmentAllowed,
      formalChangeRequestAllowed: eligibility.formalChangeRequestAllowed,
    };
  }

  private publicStatus(status: RentalRequestStatus): PublicRentalRequestStatus {
    switch (status) {
      case 'SUBMITTED':
        return { key: 'REQUEST_SUBMITTED', label: 'Request submitted' };
      case 'RE_REVIEW_REQUIRED':
        return { key: 'RE_REVIEW_REQUIRED', label: 'Changes awaiting review' };
      case 'UNDER_REVIEW':
        return { key: 'UNDER_REVIEW', label: 'Under review' };
      case 'APPROVED':
        return { key: 'APPROVED', label: 'Request approved' };
      case 'PARTIALLY_APPROVED':
        return {
          key: 'PARTIALLY_APPROVED',
          label: 'Request partially approved',
        };
      case 'REJECTED':
        return { key: 'REJECTED', label: 'Request not approved' };
    }
  }
}
