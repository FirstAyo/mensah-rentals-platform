import { Module } from '@nestjs/common';

import {
  AdminQuoteOrderController,
  AdminRentalOrderController,
} from './admin-rental-order.controller';
import { PublicRentalOrderController } from './public-rental-order.controller';
import { RentalOrderNoStoreInterceptor } from './rental-order-no-store.interceptor';
import { RentalOrderService } from './rental-order.service';
import { InventoryReservationController } from './inventory-reservation.controller';
import { InventoryReservationService } from './inventory-reservation.service';

@Module({
  controllers: [
    AdminRentalOrderController,
    AdminQuoteOrderController,
    PublicRentalOrderController,
    InventoryReservationController,
  ],
  providers: [
    RentalOrderNoStoreInterceptor,
    RentalOrderService,
    InventoryReservationService,
  ],
})
export class RentalOrderModule {}
