import { Inject, Injectable } from '@nestjs/common';
import { prisma } from '@mensah-rentals/database';

import {
  OUTBOUND_EMAIL_TRANSPORT,
  type OutboundEmailTransport,
} from './outbound-email.transport';

const RETRY_DELAY_MS = 5 * 60 * 1000;
export const PROCESSING_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class OutboundEmailDeliveryService {
  constructor(
    @Inject(OUTBOUND_EMAIL_TRANSPORT)
    private readonly transport: OutboundEmailTransport,
  ) {}

  async attempt(outboundEmailId: string): Promise<void> {
    if (!this.transport.isAvailable()) return;

    const claimed = await prisma.outboundEmail.updateMany({
      data: { lockedAt: new Date(), status: 'PROCESSING' },
      where: {
        id: outboundEmailId,
        OR: [
          { status: { in: ['FAILED', 'QUEUED'] } },
          {
            lockedAt: {
              lt: new Date(Date.now() - PROCESSING_LOCK_TIMEOUT_MS),
            },
            status: 'PROCESSING',
          },
        ],
      },
    });
    if (claimed.count !== 1) return;

    const email = await prisma.outboundEmail.findUniqueOrThrow({
      where: { id: outboundEmailId },
    });
    const attemptNumber = email.attemptCount + 1;
    try {
      const result = await this.transport.send({
        recipient: email.recipient,
        subject: email.subject,
        textBody: email.textBody,
      });
      await prisma.$transaction([
        prisma.outboundEmailAttempt.create({
          data: {
            attemptNumber,
            outboundEmailId,
            outcome: 'SENT',
          },
        }),
        prisma.outboundEmail.update({
          data: {
            attemptCount: attemptNumber,
            lastErrorCode: null,
            lastErrorMessage: null,
            lockedAt: null,
            nextAttemptAt: null,
            providerMessageId: result.providerMessageId.slice(0, 300),
            sentAt: new Date(),
            status: 'SENT',
          },
          where: { id: outboundEmailId },
        }),
      ]);
    } catch (error) {
      const safe = this.safeFailure(error);
      await prisma.$transaction([
        prisma.outboundEmailAttempt.create({
          data: {
            attemptNumber,
            outboundEmailId,
            outcome: 'FAILED',
            safeErrorCode: safe.code,
            safeErrorMessage: safe.message,
          },
        }),
        prisma.outboundEmail.update({
          data: {
            attemptCount: attemptNumber,
            lastErrorCode: safe.code,
            lastErrorMessage: safe.message,
            lockedAt: null,
            nextAttemptAt: new Date(Date.now() + RETRY_DELAY_MS),
            providerMessageId: null,
            status: 'FAILED',
          },
          where: { id: outboundEmailId },
        }),
      ]);
    }
  }

  private safeFailure(error: unknown) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
            .replace(/[^A-Za-z0-9_.-]/g, '')
            .slice(0, 80)
        : 'DELIVERY_FAILED';
    return {
      code: code || 'DELIVERY_FAILED',
      message: 'The email provider did not accept this delivery attempt.',
    };
  }
}
