import { resolve } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiEnvironmentSchema } from '@mensah-rentals/validation';

import { DatabaseService } from './database/database.service';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { CatalogueModule } from './catalogue/catalogue.module';
import { ProductMediaModule } from './media/product-media.module';
import { InventoryModule } from './inventory/inventory.module';
import { CartModule } from './cart/cart.module';
import { RentalRequestModule } from './rental-request/rental-request.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: resolve(__dirname, '../../../.env'),
      isGlobal: true,
      validate: (configuration) => apiEnvironmentSchema.parse(configuration),
    }),
    AuthModule,
    CatalogueModule,
    ProductMediaModule,
    InventoryModule,
    CartModule,
    RentalRequestModule,
  ],
  controllers: [HealthController],
  providers: [DatabaseService, HealthService],
})
export class AppModule {}
