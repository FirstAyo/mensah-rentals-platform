import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  createRentalRequestInternalNoteSchema,
  cuidParamSchema,
  rentalRequestAdminListQuerySchema,
  unassignRentalRequestSchema,
  updateRentalRequestAssignmentSchema,
  updateRentalRequestReviewStateSchema,
  type AdminRentalRequestListQuery,
  type CreateRentalRequestInternalNoteInput,
  type UnassignRentalRequestInput,
  type UpdateRentalRequestAssignmentInput,
  type UpdateRentalRequestReviewStateInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { AdminRentalRequestNoStoreInterceptor } from './admin-rental-request-no-store.interceptor';
import { AdminRentalRequestService } from './admin-rental-request.service';

@Controller('admin/rental-requests')
@UseInterceptors(AdminRentalRequestNoStoreInterceptor)
export class AdminRentalRequestController {
  constructor(
    @Inject(AdminRentalRequestService)
    private readonly requests: AdminRentalRequestService,
  ) {}

  @Get()
  @RequirePermissions('rental_request.view')
  list(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Query(new ZodBodyPipe(rentalRequestAdminListQuerySchema))
    query: AdminRentalRequestListQuery,
  ) {
    return this.requests.list(actor, query);
  }

  @Get('assignees')
  @RequirePermissions('rental_request.view', 'rental_request.assign')
  assignees() {
    return this.requests.assignees();
  }

  @Get(':id')
  @RequirePermissions('rental_request.view')
  detail(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
  ) {
    return this.requests.detail(actor, id);
  }

  @Put(':id/assignment')
  @RequirePermissions('rental_request.view', 'rental_request.assign')
  assign(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateRentalRequestAssignmentSchema))
    input: UpdateRentalRequestAssignmentInput,
  ) {
    return this.requests.assign(actor, id, input);
  }

  @Delete(':id/assignment')
  @RequirePermissions('rental_request.view', 'rental_request.assign')
  unassign(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(unassignRentalRequestSchema))
    input: UnassignRentalRequestInput,
  ) {
    return this.requests.unassign(actor, id, input);
  }

  @Get(':id/notes')
  @RequirePermissions('rental_request.view')
  notes(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.requests.notes(id);
  }

  @Post(':id/notes')
  @RequirePermissions('rental_request.view', 'rental_request.update')
  addNote(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(createRentalRequestInternalNoteSchema))
    input: CreateRentalRequestInternalNoteInput,
  ) {
    return this.requests.addNote(actor, id, input);
  }

  @Put(':id/review-state')
  @RequirePermissions('rental_request.view', 'rental_request.update')
  startReview(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateRentalRequestReviewStateSchema))
    input: UpdateRentalRequestReviewStateInput,
  ) {
    return this.requests.startReview(actor, id, input);
  }

  @Get(':id/activity')
  @RequirePermissions('rental_request.view')
  activity(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.requests.activity(id);
  }
}
