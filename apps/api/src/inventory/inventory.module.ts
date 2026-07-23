import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';
import { InventoryNoStoreInterceptor } from './inventory-no-store.interceptor';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryNoStoreInterceptor, InventoryService],
})
export class InventoryModule {}
