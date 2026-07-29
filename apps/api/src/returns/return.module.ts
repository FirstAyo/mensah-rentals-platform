import { Module } from '@nestjs/common';

import {
  AdminActiveRentalReturnController,
  AdminRentalIssueController,
  AdminReturnController,
} from './return.controller';
import { ReturnService } from './return.service';

@Module({
  controllers: [
    AdminActiveRentalReturnController,
    AdminReturnController,
    AdminRentalIssueController,
  ],
  providers: [ReturnService],
})
export class ReturnModule {}
