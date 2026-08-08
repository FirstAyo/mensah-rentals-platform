import { Module } from '@nestjs/common';

import {
  AdminEquipmentInspectionController,
  AdminMaintenanceController,
  AdminMaintenanceWorkOrderController,
} from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  controllers: [
    AdminMaintenanceWorkOrderController,
    AdminEquipmentInspectionController,
    AdminMaintenanceController,
  ],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
