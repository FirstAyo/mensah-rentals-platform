import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import type {
  PublicRentalChangeRequestResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import {
  cuidParamSchema,
  reviewRentalChangeRequestSchema,
  submitRentalChangeRequestSchema,
  type ReviewRentalChangeRequestInput,
  type SubmitRentalChangeRequestInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { Public } from '../auth/public.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import {
  type AdminRentalChangeRequestResponse,
  RentalChangeRequestService,
} from './rental-change-request.service';
import { AdminRentalRequestNoStoreInterceptor } from './admin-rental-request-no-store.interceptor';
import { PublicRentalRequestRateLimitGuard } from './public-rental-request-rate-limit.guard';

const REQUEST_TOKEN_HEADER = 'x-rental-request-token';

@Public()
@Controller('public/rental-change-requests')
@UseInterceptors(AdminRentalRequestNoStoreInterceptor)
@UseGuards(PublicRentalRequestRateLimitGuard)
export class PublicRentalChangeRequestController {
  constructor(
    @Inject(RentalChangeRequestService)
    private readonly changes: RentalChangeRequestService,
  ) {}

  @Post()
  submit(
    @Headers(REQUEST_TOKEN_HEADER) token: string | undefined,
    @Body(new ZodBodyPipe(submitRentalChangeRequestSchema))
    input: SubmitRentalChangeRequestInput,
  ): Promise<PublicRentalChangeRequestResponse> {
    return this.changes.submit(token, input);
  }

  @Get('current')
  current(
    @Headers(REQUEST_TOKEN_HEADER) token: string | undefined,
  ): Promise<PublicRentalChangeRequestResponse[]> {
    return this.changes.current(token);
  }

  @Get(':id')
  detail(
    @Headers(REQUEST_TOKEN_HEADER) token: string | undefined,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
  ): Promise<PublicRentalChangeRequestResponse> {
    return this.changes.publicDetail(token, id);
  }
}

@Controller('admin/change-requests')
@UseInterceptors(AdminRentalRequestNoStoreInterceptor)
export class AdminRentalChangeRequestController {
  constructor(
    @Inject(RentalChangeRequestService)
    private readonly changes: RentalChangeRequestService,
  ) {}

  @Get()
  @RequirePermissions('rental_change_request.view')
  list(): Promise<AdminRentalChangeRequestResponse[]> {
    return this.changes.adminList();
  }

  @Get(':id')
  @RequirePermissions('rental_change_request.view')
  detail(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
  ): Promise<AdminRentalChangeRequestResponse> {
    return this.changes.adminDetail(id);
  }

  @Put(':id/review-state')
  @RequirePermissions(
    'rental_change_request.view',
    'rental_change_request.review',
  )
  review(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(reviewRentalChangeRequestSchema))
    input: ReviewRentalChangeRequestInput,
  ): Promise<AdminRentalChangeRequestResponse> {
    return this.changes.review(actor, id, input);
  }
}
