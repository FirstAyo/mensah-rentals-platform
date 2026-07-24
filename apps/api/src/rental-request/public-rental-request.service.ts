import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashSessionToken } from '@mensah-rentals/auth';
import { prisma, type Prisma } from '@mensah-rentals/database';
import type { PublicRentalRequestResponse } from '@mensah-rentals/types';
import {
  rentalRequestReferenceSchema,
  type ApiEnvironment,
  type SubmitRentalRequestInput,
} from '@mensah-rentals/validation';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const requestSelect = {
  fulfillmentMethod: true,
  id: true,
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { productId: 'asc' as const }],
    select: {
      categoryName: true,
      categorySlug: true,
      productName: true,
      productSlug: true,
      rentalUnit: true,
      requestedQuantity: true,
    },
  },
  projectName: true,
  referenceNumber: true,
  rentalEndDate: true,
  rentalStartDate: true,
  status: true,
  submittedAt: true,
} satisfies Prisma.RentalRequestSelect;

type SelectedRequest = Prisma.RentalRequestGetPayload<{
  select: typeof requestSelect;
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
        where: {
          OR: [{ submissionKeyHash }, { sourceCartTokenHash }],
        },
        select: {
          ...requestSelect,
          guestSession: { select: { expiresAt: true } },
          guestSessionId: true,
          sourceCartTokenHash: true,
          submissionPayloadHash: true,
        },
      });
      if (replay) {
        if (
          replay.sourceCartTokenHash !== sourceCartTokenHash ||
          replay.submissionPayloadHash !== submissionPayloadHash
        )
          throw new ConflictException(
            'This submission identifier has already been used.',
          );
        if (replay.guestSession.expiresAt <= new Date())
          throw new ConflictException(
            'This rental request submission can no longer be replayed.',
          );
        return {
          expiresAt: replay.guestSession.expiresAt,
          rawRequestToken: this.sessionToken(replay.guestSessionId),
          request: replay,
        };
      }

      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Cart"
        WHERE "tokenHash" = ${sourceCartTokenHash} AND "expiresAt" > CURRENT_TIMESTAMP
        FOR UPDATE
      `;
      const cartId = locked[0]?.id;
      if (!cartId) {
        // A concurrent identical submission may have consumed the cart while
        // this transaction waited for its row lock. Re-read after the lock so
        // both callers receive the same durable request.
        const committed = await tx.rentalRequest.findUnique({
          where: { sourceCartTokenHash },
          select: {
            ...requestSelect,
            guestSession: { select: { expiresAt: true } },
            guestSessionId: true,
            submissionPayloadHash: true,
          },
        });
        if (committed?.submissionPayloadHash === submissionPayloadHash) {
          if (committed.guestSession.expiresAt <= new Date())
            throw new ConflictException(
              'This rental request submission can no longer be replayed.',
            );
          return {
            expiresAt: committed.guestSession.expiresAt,
            rawRequestToken: this.sessionToken(committed.guestSessionId),
            request: committed,
          };
        }
        throw new UnprocessableEntityException(
          'Your rental cart is unavailable. Please review it and try again.',
        );
      }
      const cart = await tx.cart.findUniqueOrThrow({
        where: { id: cartId },
        select: {
          items: {
            orderBy: [
              { createdAt: 'asc' as const },
              { productId: 'asc' as const },
            ],
            select: {
              desiredQuantity: true,
              product: {
                select: {
                  category: {
                    select: { isActive: true, name: true, slug: true },
                  },
                  id: true,
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
      const created = await tx.rentalRequest.create({
        data: {
          referenceNumber: await this.reference(tx),
          submissionKeyHash,
          submissionPayloadHash,
          sourceCartTokenHash,
          guestSessionId: session.id,
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
        select: requestSelect,
      });
      await tx.cart.delete({ where: { id: cartId } });
      return {
        expiresAt: session.expiresAt,
        rawRequestToken: session.rawToken,
        request: created,
      };
    });
    return {
      expiresAt: result.expiresAt,
      rawRequestToken: result.rawRequestToken,
      request: this.map(result.request),
    };
  }

  async track(
    rawRequestToken: string | undefined,
    rawReference: string,
  ): Promise<RentalRequestOperationResult> {
    const parsedReference =
      rentalRequestReferenceSchema.safeParse(rawReference);
    const validToken = rawRequestToken && TOKEN_PATTERN.test(rawRequestToken);
    const tokenHash = hashSessionToken(
      validToken ? rawRequestToken : 'invalid-request-capability',
    );
    const request = await prisma.rentalRequest.findFirst({
      where: {
        referenceNumber: parsedReference.success
          ? parsedReference.data
          : 'MR-0000-INVALID0000',
        guestSession: {
          tokenHash,
          expiresAt: { gt: new Date() },
        },
      },
      select: requestSelect,
    });
    if (!request)
      throw new NotFoundException('Rental request could not be found.');
    return { request: this.map(request) };
  }

  private async resolveSession(
    tx: Prisma.TransactionClient,
    rawToken?: string,
  ): Promise<{ expiresAt: Date; id: string; rawToken: string }> {
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
          data: { expiresAt, updatedAt: new Date() },
        });
        return { expiresAt, id: existing.id, rawToken };
      }
    }
    const id = randomUUID();
    const rawGeneratedToken = this.sessionToken(id);
    const expiresAt = this.expiry();
    await tx.guestRequestSession.create({
      data: {
        id,
        tokenHash: hashSessionToken(rawGeneratedToken),
        expiresAt,
      },
    });
    return { expiresAt, id, rawToken: rawGeneratedToken };
  }

  private async reference(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const bytes = randomBytes(10);
      const suffix = Array.from(bytes, (byte) =>
        REFERENCE_ALPHABET.charAt(byte % REFERENCE_ALPHABET.length),
      )
        .join('')
        .slice(0, 10);
      const value = `MR-${new Date().getUTCFullYear()}-${suffix}`;
      const exists = await tx.rentalRequest.findUnique({
        where: { referenceNumber: value },
        select: { id: true },
      });
      if (!exists) return value;
    }
    throw new ConflictException('A request reference could not be generated.');
  }

  private sessionToken(sessionId: string): string {
    return createHmac(
      'sha256',
      this.config.get('PUBLIC_REQUEST_TRACKING_SECRET', { infer: true }),
    )
      .update(sessionId, 'utf8')
      .digest('base64url');
  }

  private expiry(): Date {
    const days = this.config.get('PUBLIC_REQUEST_TRACKING_TTL_DAYS', {
      infer: true,
    });
    return new Date(Date.now() + days * 86_400_000);
  }

  private date(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private map(request: SelectedRequest): PublicRentalRequestResponse {
    return {
      fulfillmentMethod: request.fulfillmentMethod,
      items: request.items,
      projectName: request.projectName,
      referenceNumber: request.referenceNumber,
      rentalEndDate: request.rentalEndDate.toISOString().slice(0, 10),
      rentalStartDate: request.rentalStartDate.toISOString().slice(0, 10),
      status: { key: 'REQUEST_SUBMITTED', label: 'Request submitted' },
      submittedAt: request.submittedAt.toISOString(),
    };
  }
}
