import { Module } from '@nestjs/common';

import {
  AdminQuoteOrderController,
  AdminRentalOrderController,
} from './admin-rental-order.controller';
import { PublicRentalOrderController } from './public-rental-order.controller';
import { RentalOrderNoStoreInterceptor } from './rental-order-no-store.interceptor';
import { RentalOrderService } from './rental-order.service';

@Module({
  controllers: [
    AdminRentalOrderController,
    AdminQuoteOrderController,
    PublicRentalOrderController,
  ],
  providers: [RentalOrderNoStoreInterceptor, RentalOrderService],
})
export class RentalOrderModule {}
