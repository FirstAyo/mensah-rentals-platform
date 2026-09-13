import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: mail.createTransport },
}));

import { SmtpOutboundEmailTransport } from './outbound-email.transport';

describe('SMTP outbound email transport', () => {
  beforeEach(() => {
    mail.createTransport.mockReset();
    mail.sendMail.mockReset();
    mail.createTransport.mockReturnValue({ sendMail: mail.sendMail });
    mail.sendMail.mockResolvedValue({ messageId: '<provider-message@test>' });
  });

  it('uses authenticated TLS SMTP without exposing configuration in the result', async () => {
    const config = new ConfigService<ApiEnvironment, true>({
      SMTP_ENABLED: true,
      SMTP_FROM_EMAIL: 'info@mensahrentals.com',
      SMTP_FROM_NAME: 'Mensah Rentals',
      SMTP_HOST: 'mail.mensahrentals.com',
      SMTP_PASSWORD: 'test-only-password',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_USER: 'info@mensahrentals.com',
    } as ApiEnvironment);
    const transport = new SmtpOutboundEmailTransport(config);

    expect(transport.isAvailable()).toBe(true);
    expect(mail.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'mail.mensahrentals.com',
        port: 587,
        requireTLS: true,
        secure: false,
        tls: { minVersion: 'TLSv1.2' },
      }),
    );
    await expect(
      transport.send({
        recipient: 'company@example.test',
        subject: 'Test enquiry',
        textBody: 'Safe test body',
      }),
    ).resolves.toEqual({ providerMessageId: '<provider-message@test>' });
    expect(mail.sendMail).toHaveBeenCalledWith({
      from: {
        address: 'info@mensahrentals.com',
        name: 'Mensah Rentals',
      },
      subject: 'Test enquiry',
      text: 'Safe test body',
      to: 'company@example.test',
    });
  });
});
