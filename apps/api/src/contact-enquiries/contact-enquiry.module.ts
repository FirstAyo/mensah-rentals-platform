import { Module } from '@nestjs/common';

import {
  AdminContactEnquiryController,
  PublicContactEnquiryController,
} from './contact-enquiry.controller';
import { ContactEnquiryRateLimitGuard } from './contact-enquiry-rate-limit.guard';
import { ContactEnquiryService } from './contact-enquiry.service';

@Module({
  controllers: [AdminContactEnquiryController, PublicContactEnquiryController],
  providers: [ContactEnquiryRateLimitGuard, ContactEnquiryService],
})
export class ContactEnquiryModule {}
