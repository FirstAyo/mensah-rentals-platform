import { Module } from '@nestjs/common';

import { PublicCartController } from './public-cart.controller';
import { PublicCartService } from './public-cart.service';

@Module({
  controllers: [PublicCartController],
  providers: [PublicCartService],
})
export class CartModule {}
