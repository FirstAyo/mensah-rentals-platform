import { Module } from '@nestjs/common';

import { PublicCartController } from './public-cart.controller';
import { PublicCartRateLimitGuard } from './public-cart-rate-limit.guard';
import { PublicCartService } from './public-cart.service';

@Module({
  controllers: [PublicCartController],
  providers: [PublicCartService, PublicCartRateLimitGuard],
})
export class CartModule {}
