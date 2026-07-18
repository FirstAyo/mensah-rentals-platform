import { Controller, Get } from '@nestjs/common';
import type {
  ApiHealthResponse,
  DatabaseHealthResponse,
} from '@mensah-rentals/types';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getApiHealth(): ApiHealthResponse {
    return this.healthService.getApiHealth();
  }

  @Get('database')
  getDatabaseHealth(): Promise<DatabaseHealthResponse> {
    return this.healthService.getDatabaseHealth();
  }
}
