import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  contactEnquiryListQuerySchema,
  cuidParamSchema,
  submitContactEnquirySchema,
  updateContactEnquiryStatusSchema,
  type ContactEnquiryListQuery,
  type SubmitContactEnquiryInput,
  type UpdateContactEnquiryStatusInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { ContactEnquiryRateLimitGuard } from './contact-enquiry-rate-limit.guard';
import { ContactEnquiryService } from './contact-enquiry.service';

@Controller('public/contact-enquiries')
export class PublicContactEnquiryController {
  constructor(
    @Inject(ContactEnquiryService)
    private readonly enquiries: ContactEnquiryService,
  ) {}

  @Public()
  @Post()
  @HttpCode(202)
  @UseGuards(ContactEnquiryRateLimitGuard)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  submit(
    @Body(new ZodBodyPipe(submitContactEnquirySchema))
    input: SubmitContactEnquiryInput,
  ) {
    return this.enquiries.submit(input);
  }
}

@Controller('admin/contact-enquiries')
export class AdminContactEnquiryController {
  constructor(
    @Inject(ContactEnquiryService)
    private readonly enquiries: ContactEnquiryService,
  ) {}

  @Get()
  @RequirePermissions('contact_enquiry.view')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Query(new ZodBodyPipe(contactEnquiryListQuerySchema))
    query: ContactEnquiryListQuery,
  ) {
    return this.enquiries.list(query);
  }

  @Get(':id')
  @RequirePermissions('contact_enquiry.view')
  @Header('Cache-Control', 'private, no-store')
  get(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.enquiries.get(id);
  }

  @Put(':id/status')
  @RequirePermissions('contact_enquiry.manage')
  @Header('Cache-Control', 'private, no-store')
  updateStatus(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateContactEnquiryStatusSchema))
    input: UpdateContactEnquiryStatusInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.enquiries.updateStatus(id, user.id, input);
  }
}
