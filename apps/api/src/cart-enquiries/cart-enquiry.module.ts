import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';

import {
  AdminCartEnquiryController,
  PublicCartEnquiryController,
} from './cart-enquiry.controller';
import { CartEnquiryRateLimitGuard } from './cart-enquiry-rate-limit.guard';
import { CartEnquiryService } from './cart-enquiry.service';
import { OutboundEmailDeliveryService } from './outbound-email-delivery.service';
import {
  OUTBOUND_EMAIL_TRANSPORT,
  SafeCaptureOutboundEmailTransport,
  SmtpOutboundEmailTransport,
} from './outbound-email.transport';

@Module({
  controllers: [AdminCartEnquiryController, PublicCartEnquiryController],
  providers: [
    CartEnquiryRateLimitGuard,
    CartEnquiryService,
    OutboundEmailDeliveryService,
    SafeCaptureOutboundEmailTransport,
    SmtpOutboundEmailTransport,
    {
      provide: OUTBOUND_EMAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnvironment, true>) =>
        config.get<boolean>('SMTP_ENABLED')
          ? new SmtpOutboundEmailTransport(config)
          : new SafeCaptureOutboundEmailTransport(config),
    },
  ],
})
export class CartEnquiryModule {}
