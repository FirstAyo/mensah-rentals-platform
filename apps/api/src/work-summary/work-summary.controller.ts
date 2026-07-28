import { Controller, Get, Header, Inject } from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { WorkSummaryService } from './work-summary.service';

@Controller('admin/work-summary')
export class WorkSummaryController {
  constructor(
    @Inject(WorkSummaryService) private readonly summary: WorkSummaryService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  get(@CurrentStaffUser() actor: StaffUserResponse) {
    return this.summary.get(actor);
  }
}
