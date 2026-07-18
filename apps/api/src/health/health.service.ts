import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  ApiHealthResponse,
  DatabaseHealthResponse,
} from '@mensah-rentals/types';

import { DatabaseService } from '../database/database.service';

@Injectable()
export class HealthService {
  constructor(private readonly databaseService: DatabaseService) {}

  getApiHealth(): ApiHealthResponse {
    return {
      service: 'mensah-rentals-api',
      status: 'ok',
    };
  }

  async getDatabaseHealth(): Promise<DatabaseHealthResponse> {
    try {
      await this.databaseService.checkConnection();

      return {
        database: 'connected',
        status: 'ok',
      };
    } catch {
      throw new ServiceUnavailableException({
        database: 'unavailable',
        status: 'error',
      });
    }
  }
}
