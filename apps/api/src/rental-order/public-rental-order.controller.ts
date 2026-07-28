import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { orderCustomerAccessSchema } from '@mensah-rentals/validation';

import { Public } from '../auth/public.decorator';
import { RentalOrderNoStoreInterceptor } from './rental-order-no-store.interceptor';
import { RentalOrderService } from './rental-order.service';

const capabilityHeader = 'x-order-capability';

@Public()
@Controller('public/orders')
@UseInterceptors(RentalOrderNoStoreInterceptor)
export class PublicRentalOrderController {
  constructor(
    @Inject(RentalOrderService) private readonly orders: RentalOrderService,
  ) {}

  @Post('access')
  access(@Body() input: unknown) {
    const parsed = orderCustomerAccessSchema.safeParse(input);
    if (!parsed.success) throw new NotFoundException('Order is unavailable');
    return this.orders.validateCapability(parsed.data.capability);
  }

  @Get('current')
  current(@Headers(capabilityHeader) capability: string | undefined) {
    return this.orders.publicCurrent(capability ?? '');
  }

  @Post('current/view')
  view(@Headers(capabilityHeader) capability: string | undefined) {
    return this.orders.markViewed(capability ?? '');
  }
}
