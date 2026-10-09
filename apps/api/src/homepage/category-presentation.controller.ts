import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  categoryPresentationSchema,
  cuidParamSchema,
  type CategoryPresentationInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CategoryPresentationService } from './category-presentation.service';

@Controller('admin/categories/:categoryId/presentation')
export class CategoryPresentationController {
  constructor(private readonly presentation: CategoryPresentationService) {}

  @Get()
  @RequirePermissions('category.view')
  get(
    @Param('categoryId', new ZodBodyPipe(cuidParamSchema)) categoryId: string,
  ) {
    return this.presentation.get(categoryId);
  }

  @Put()
  @RequirePermissions('category.update', 'homepage.media.manage')
  replace(
    @Param('categoryId', new ZodBodyPipe(cuidParamSchema)) categoryId: string,
    @Body(new ZodBodyPipe(categoryPresentationSchema))
    input: CategoryPresentationInput,
    @CurrentStaffUser() user: StaffUserResponse,
  ) {
    return this.presentation.replace(categoryId, input, user.id);
  }
}
