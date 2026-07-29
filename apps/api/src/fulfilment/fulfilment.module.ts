import { Module } from '@nestjs/common';
import {
  AdminActiveRentalController,
  AdminFulfilmentController,
} from './fulfilment.controller';
import { FulfilmentService } from './fulfilment.service';

@Module({
  controllers: [AdminFulfilmentController, AdminActiveRentalController],
  providers: [FulfilmentService],
})
export class FulfilmentModule {}
