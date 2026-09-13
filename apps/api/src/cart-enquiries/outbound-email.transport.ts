import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { ApiEnvironment } from '@mensah-rentals/validation';

export interface OutboundEmailMessage {
  recipient: string;
  subject: string;
  textBody: string;
}

export interface OutboundEmailSendResult {
  providerMessageId: string;
}

export const OUTBOUND_EMAIL_TRANSPORT = Symbol('OUTBOUND_EMAIL_TRANSPORT');

export interface OutboundEmailTransport {
  isAvailable(): boolean;
  send(message: OutboundEmailMessage): Promise<OutboundEmailSendResult>;
}

/** Local and test environments capture mail without making a network request. */
@Injectable()
export class SafeCaptureOutboundEmailTransport
  implements OutboundEmailTransport
{
  readonly captured: OutboundEmailMessage[] = [];

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  isAvailable(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  async send(message: OutboundEmailMessage): Promise<OutboundEmailSendResult> {
    this.captured.push({ ...message });
    return { providerMessageId: `capture-${randomUUID()}` };
  }
}

@Injectable()
export class SmtpOutboundEmailTransport implements OutboundEmailTransport {
  private readonly mailer: Transporter;
  private readonly from: { address: string; name: string };

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {
    const secure = config.get('SMTP_SECURE', { infer: true });
    this.from = {
      address: config.get('SMTP_FROM_EMAIL', { infer: true }),
      name: config.get('SMTP_FROM_NAME', { infer: true }),
    };
    this.mailer = nodemailer.createTransport({
      auth: {
        pass: config.get('SMTP_PASSWORD', { infer: true }),
        user: config.get('SMTP_USER', { infer: true }),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      requireTLS: !secure,
      secure,
      socketTimeout: 20_000,
      tls: { minVersion: 'TLSv1.2' },
    });
  }

  isAvailable(): boolean {
    return this.config.get('SMTP_ENABLED', { infer: true });
  }

  async send(message: OutboundEmailMessage): Promise<OutboundEmailSendResult> {
    const result = await this.mailer.sendMail({
      from: this.from,
      subject: message.subject,
      text: message.textBody,
      to: message.recipient,
    });
    return { providerMessageId: result.messageId };
  }
}
