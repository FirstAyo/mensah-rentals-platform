import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  addMaintenanceNoteSchema,
  assignMaintenanceWorkOrderSchema,
  cancelEquipmentInspectionSchema,
  cancelMaintenanceWorkOrderSchema,
  completeMaintenanceWorkOrderSchema,
  createEquipmentInspectionSchema,
  createMaintenanceWorkOrderSchema,
  cuidParamSchema,
  equipmentInspectionActionSchema,
  equipmentInspectionListQuerySchema,
  failEquipmentInspectionSchema,
  maintenanceWorkOrderActionSchema,
  maintenanceWorkOrderListQuerySchema,
  maintenanceStaffQuerySchema,
  passEquipmentInspectionSchema,
  unassignMaintenanceWorkOrderSchema,
  updateMaintenanceWorkOrderSchema,
  type AddMaintenanceNoteInput,
  type AssignMaintenanceWorkOrderInput,
  type CancelEquipmentInspectionInput,
  type CancelMaintenanceWorkOrderInput,
  type CompleteMaintenanceWorkOrderInput,
  type CreateEquipmentInspectionInput,
  type CreateMaintenanceWorkOrderInput,
  type EquipmentInspectionActionInput,
  type EquipmentInspectionListQuery,
  type MaintenanceWorkOrderActionInput,
  type MaintenanceWorkOrderListQuery,
  type MaintenanceStaffQuery,
  type UnassignMaintenanceWorkOrderInput,
  type UpdateMaintenanceWorkOrderInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireFeature } from '../feature-settings/requires-feature.decorator';
import { RentalOrderZodPipe } from '../rental-order/rental-order-zod.pipe';
import { MaintenanceNoStoreInterceptor } from './maintenance-no-store.interceptor';
import { MaintenanceService } from './maintenance.service';

@Controller('admin/maintenance')
@RequireFeature('MAINTENANCE')
@UseInterceptors(MaintenanceNoStoreInterceptor)
export class AdminMaintenanceController {
  constructor(
    @Inject(MaintenanceService)
    private readonly maintenance: MaintenanceService,
  ) {}

  @Get('staff')
  @RequirePermissions('maintenance.assign')
  staff(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Query(new RentalOrderZodPipe(maintenanceStaffQuerySchema))
    query: MaintenanceStaffQuery,
  ) {
    return this.maintenance.assignees(actor.id, query);
  }

  @Get('sources/issues/:id')
  @RequirePermissions('maintenance.create', 'rental_issue.view')
  issueSource(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
  ) {
    return this.maintenance.issueSource(actor.id, id);
  }

  @Get('sources/return-items/:id')
  @RequirePermissions('maintenance.create', 'return.view')
  returnItemSource(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
  ) {
    return this.maintenance.returnItemSource(actor.id, id);
  }
}

@Controller('admin/maintenance/work-orders')
@RequireFeature('MAINTENANCE')
@UseInterceptors(MaintenanceNoStoreInterceptor)
export class AdminMaintenanceWorkOrderController {
  constructor(
    @Inject(MaintenanceService)
    private readonly maintenance: MaintenanceService,
  ) {}

  @Get()
  @RequirePermissions('maintenance.view')
  list(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Query(new RentalOrderZodPipe(maintenanceWorkOrderListQuerySchema))
    query: MaintenanceWorkOrderListQuery,
  ) {
    return this.maintenance.listWorkOrders(actor.id, query);
  }

  @Post()
  @RequirePermissions('maintenance.create')
  create(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new RentalOrderZodPipe(createMaintenanceWorkOrderSchema))
    input: CreateMaintenanceWorkOrderInput,
  ) {
    return this.maintenance.createWorkOrder(actor.id, input);
  }

  @Get(':id')
  @RequirePermissions('maintenance.view')
  detail(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
  ) {
    return this.maintenance.workOrder(actor.id, id);
  }

  @Post(':id/update')
  @RequirePermissions('maintenance.update')
  update(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(updateMaintenanceWorkOrderSchema))
    input: UpdateMaintenanceWorkOrderInput,
  ) {
    return this.maintenance.updateWorkOrder(actor.id, id, input);
  }

  @Post(':id/assign')
  @RequirePermissions('maintenance.assign')
  assign(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(assignMaintenanceWorkOrderSchema))
    input: AssignMaintenanceWorkOrderInput,
  ) {
    return this.maintenance.assign(actor.id, id, input);
  }

  @Post(':id/unassign')
  @RequirePermissions('maintenance.assign')
  unassign(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(unassignMaintenanceWorkOrderSchema))
    input: UnassignMaintenanceWorkOrderInput,
  ) {
    return this.maintenance.unassign(actor.id, id, input);
  }

  @Post(':id/start')
  @RequirePermissions('maintenance.update')
  start(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(maintenanceWorkOrderActionSchema))
    input: MaintenanceWorkOrderActionInput,
  ) {
    return this.maintenance.start(actor.id, id, input);
  }

  @Post(':id/waiting-for-parts')
  @RequirePermissions('maintenance.update')
  waitingForParts(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(maintenanceWorkOrderActionSchema))
    input: MaintenanceWorkOrderActionInput,
  ) {
    return this.maintenance.waitingForParts(actor.id, id, input);
  }

  @Post(':id/resume')
  @RequirePermissions('maintenance.update')
  resume(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(maintenanceWorkOrderActionSchema))
    input: MaintenanceWorkOrderActionInput,
  ) {
    return this.maintenance.resume(actor.id, id, input);
  }

  @Post(':id/ready-for-inspection')
  @RequirePermissions('maintenance.update')
  readyForInspection(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(maintenanceWorkOrderActionSchema))
    input: MaintenanceWorkOrderActionInput,
  ) {
    return this.maintenance.readyForInspection(actor.id, id, input);
  }

  @Post(':id/complete')
  @RequirePermissions(
    'maintenance.complete',
    'maintenance.inventory_transition',
  )
  complete(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(completeMaintenanceWorkOrderSchema))
    input: CompleteMaintenanceWorkOrderInput,
  ) {
    return this.maintenance.complete(actor.id, id, input);
  }

  @Post(':id/cancel')
  @RequirePermissions('maintenance.cancel')
  cancel(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(cancelMaintenanceWorkOrderSchema))
    input: CancelMaintenanceWorkOrderInput,
  ) {
    return this.maintenance.cancel(actor.id, id, input);
  }

  @Post(':id/notes')
  @RequirePermissions('maintenance.note')
  note(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(addMaintenanceNoteSchema))
    input: AddMaintenanceNoteInput,
  ) {
    return this.maintenance.addNote(actor.id, id, input);
  }
}

@Controller('admin/maintenance/inspections')
@RequireFeature('INSPECTIONS')
@UseInterceptors(MaintenanceNoStoreInterceptor)
export class AdminEquipmentInspectionController {
  constructor(
    @Inject(MaintenanceService)
    private readonly maintenance: MaintenanceService,
  ) {}

  @Get()
  @RequirePermissions('inspection.view')
  list(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Query(new RentalOrderZodPipe(equipmentInspectionListQuerySchema))
    query: EquipmentInspectionListQuery,
  ) {
    return this.maintenance.listInspections(actor.id, query);
  }

  @Post()
  @RequirePermissions('inspection.create')
  create(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new RentalOrderZodPipe(createEquipmentInspectionSchema))
    input: CreateEquipmentInspectionInput,
  ) {
    return this.maintenance.createInspection(actor.id, input);
  }

  @Get(':id')
  @RequirePermissions('inspection.view')
  detail(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
  ) {
    return this.maintenance.inspection(actor.id, id);
  }

  @Post(':id/start')
  @RequirePermissions('inspection.perform')
  start(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(equipmentInspectionActionSchema))
    input: EquipmentInspectionActionInput,
  ) {
    return this.maintenance.startInspection(actor.id, id, input);
  }

  @Post(':id/pass')
  @RequirePermissions('inspection.perform')
  pass(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(passEquipmentInspectionSchema))
    input: EquipmentInspectionActionInput & { summary: string },
  ) {
    return this.maintenance.passInspection(actor.id, id, input);
  }

  @Post(':id/fail')
  @RequirePermissions('inspection.perform')
  fail(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(failEquipmentInspectionSchema))
    input: EquipmentInspectionActionInput & { summary: string },
  ) {
    return this.maintenance.failInspection(actor.id, id, input);
  }

  @Post(':id/cancel')
  @RequirePermissions('inspection.cancel')
  cancel(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new RentalOrderZodPipe(cuidParamSchema)) id: string,
    @Body(new RentalOrderZodPipe(cancelEquipmentInspectionSchema))
    input: CancelEquipmentInspectionInput,
  ) {
    return this.maintenance.cancelInspection(actor.id, id, input);
  }
}
