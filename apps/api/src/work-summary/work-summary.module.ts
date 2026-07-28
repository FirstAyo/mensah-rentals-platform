import { Module } from '@nestjs/common';

import { WorkSummaryController } from './work-summary.controller';
import { WorkSummaryService } from './work-summary.service';

@Module({
  controllers: [WorkSummaryController],
  providers: [WorkSummaryService],
})
export class WorkSummaryModule {}
