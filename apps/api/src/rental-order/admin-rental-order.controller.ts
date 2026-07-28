import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  createRentalOrderSchema,
  cuidParamSchema,
  rentalOrderListQuerySchema,
  type CreateRentalOrderInput,
  type RentalOrderListQuery,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RentalOrderNoStoreInterceptor } from './rental-order-no-store.interceptor';
import { RentalOrderService } from './rental-order.service';
import { RentalOrderZodPipe } from './rental-order-zod.pipe';

@Controller('admin/orders')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class AdminRentalOrderController {
  constructor(
    @Inject(RentalOrderService) private readonly orders: RentalOrderService,
  ) {}

  @Get()
  @RequirePermissions('order.view')
  list(
    @Query(new RentalOrderZodPipe(rentalOrderListQuerySchema))
    query: RentalOrderListQuery,
  ) {
    return this.orders.list(query);
  }

  @Get(':id')
  @RequirePermissions('order.view')
  detail(@Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string) {
    return this.orders.detail(id);
  }
}

@Controller('admin/quotes')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class AdminQuoteOrderController {
  constructor(
    @Inject(RentalOrderService) private readonly orders: RentalOrderService,
  ) {}

  @Post(':quoteId/revisions/:revisionId/order')
  @RequirePermissions('order.create')
  create(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('quoteId', new RentalOrderZodPipe(cuidParamSchema)) quoteId: string,
    @Param('revisionId', new RentalOrderZodPipe(cuidParamSchema))
    revisionId: string,
    @Body(new RentalOrderZodPipe(createRentalOrderSchema))
    input: CreateRentalOrderInput,
  ) {
    return this.orders.create(actor, quoteId, revisionId, input);
  }
}
