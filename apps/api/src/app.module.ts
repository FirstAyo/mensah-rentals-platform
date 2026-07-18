import { resolve } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiEnvironmentSchema } from '@mensah-rentals/validation';

import { DatabaseService } from './database/database.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: resolve(__dirname, '../../../.env'),
      isGlobal: true,
      validate: (configuration) => apiEnvironmentSchema.parse(configuration),
    }),
  ],
  controllers: [HealthController],
  providers: [DatabaseService, HealthService],
})
export class AppModule {}
