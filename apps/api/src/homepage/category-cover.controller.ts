import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  categoryCoverSchema,
  cuidParamSchema,
  type CategoryCoverInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CategoryCoverService } from './category-cover.service';

@Controller('admin/categories/:categoryId/cover-image')
export class CategoryCoverController {
  constructor(private readonly covers: CategoryCoverService) {}

  @Get()
  @RequirePermissions('category.view')
  get(
    @Param('categoryId', new ZodBodyPipe(cuidParamSchema)) categoryId: string,
  ) {
    return this.covers.get(categoryId);
  }

  @Put()
  @RequirePermissions('category.update', 'homepage.media.manage')
  assign(
    @Param('categoryId', new ZodBodyPipe(cuidParamSchema)) categoryId: string,
    @Body(new ZodBodyPipe(categoryCoverSchema)) input: CategoryCoverInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.covers.assign(categoryId, input, user.id);
  }

  @Delete()
  @RequirePermissions('category.update', 'homepage.media.manage')
  remove(
    @Param('categoryId', new ZodBodyPipe(cuidParamSchema)) categoryId: string,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.covers.remove(categoryId, user.id);
  }
}
