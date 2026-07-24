import { Module } from '@nestjs/common';

import { PublicRentalRequestController } from './public-rental-request.controller';
import { PublicRentalRequestRateLimitGuard } from './public-rental-request-rate-limit.guard';
import { PublicRentalRequestService } from './public-rental-request.service';

@Module({
  controllers: [PublicRentalRequestController],
  providers: [PublicRentalRequestService, PublicRentalRequestRateLimitGuard],
})
export class RentalRequestModule {}
