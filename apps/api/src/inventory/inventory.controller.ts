import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  bulkInventoryMovementSchema,
  addInventoryStockSchema,
  createInventoryItemSchema,
  createInventorySchema,
  cuidParamSchema,
  inventoryListQuerySchema,
  inventoryPageQuerySchema,
  inventoryLifecycleActionSchema,
  reduceInventoryStockSchema,
  transitionInventoryItemSchema,
  updateInventoryMetadataSchema,
  type AddInventoryStockInput,
  type BulkInventoryMovementInput,
  type CreateInventoryInput,
  type CreateInventoryItemInput,
  type InventoryListQuery,
  type InventoryLifecycleActionInput,
  type InventoryPageQuery,
  type TransitionInventoryItemInput,
  type ReduceInventoryStockInput,
  type UpdateInventoryMetadataInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { InventoryService } from './inventory.service';
import { InventoryNoStoreInterceptor } from './inventory-no-store.interceptor';

@Controller('admin/inventory')
@UseInterceptors(InventoryNoStoreInterceptor)
export class InventoryController {
  constructor(
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}

  @Get()
  @RequirePermissions('inventory.view')
  list(
    @Query(new ZodBodyPipe(inventoryListQuerySchema)) query: InventoryListQuery,
  ) {
    return this.inventory.list(query);
  }

  @Post()
  @RequirePermissions(
    'inventory.view',
    'inventory.quantity.view',
    'inventory.adjust',
  )
  create(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Body(new ZodBodyPipe(createInventorySchema)) input: CreateInventoryInput,
  ) {
    return this.inventory.create(actor.id, input);
  }

  @Get(':id')
  @RequirePermissions('inventory.view')
  get(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.inventory.get(id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.view', 'inventory.adjust')
  updateMetadata(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(updateInventoryMetadataSchema))
    input: UpdateInventoryMetadataInput,
  ) {
    return this.inventory.updateMetadata(actor.id, id, input);
  }

  @Post(':id/stock-additions')
  @RequirePermissions(
    'inventory.view',
    'inventory.quantity.view',
    'inventory.adjust',
  )
  addStock(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(addInventoryStockSchema))
    input: AddInventoryStockInput,
  ) {
    return this.inventory.addStock(actor.id, id, input);
  }

  @Post(':id/stock-reductions')
  @RequirePermissions(
    'inventory.view',
    'inventory.quantity.view',
    'inventory.adjust',
  )
  reduceStock(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(reduceInventoryStockSchema))
    input: ReduceInventoryStockInput,
  ) {
    return this.inventory.reduceStock(actor.id, id, input);
  }

  @Get(':id/lifecycle')
  @RequirePermissions('inventory.view', 'inventory.quantity.view')
  lifecycle(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.inventory.lifecycle(id);
  }

  @Post(':id/archive')
  @RequirePermissions('inventory.view', 'inventory.adjust')
  archive(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(inventoryLifecycleActionSchema))
    input: InventoryLifecycleActionInput,
  ) {
    return this.inventory.archive(actor.id, id, input);
  }

  @Post(':id/restore')
  @RequirePermissions('inventory.view', 'inventory.adjust')
  restore(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(inventoryLifecycleActionSchema))
    input: InventoryLifecycleActionInput,
  ) {
    return this.inventory.restore(actor.id, id, input);
  }

  @Delete(':id')
  @RequirePermissions('inventory.view', 'inventory.adjust')
  delete(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(inventoryLifecycleActionSchema))
    input: InventoryLifecycleActionInput,
  ) {
    return this.inventory.delete(actor.id, id, input);
  }

  @Get(':id/quantities')
  @RequirePermissions('inventory.view', 'inventory.quantity.view')
  quantities(@Param('id', new ZodBodyPipe(cuidParamSchema)) id: string) {
    return this.inventory.quantities(id);
  }

  @Post(':id/bulk-movements')
  @RequirePermissions(
    'inventory.view',
    'inventory.quantity.view',
    'inventory.adjust',
  )
  moveBulk(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(bulkInventoryMovementSchema))
    input: BulkInventoryMovementInput,
  ) {
    return this.inventory.moveBulk(actor.id, id, input);
  }

  @Get(':id/items')
  @RequirePermissions('inventory.view', 'inventory.quantity.view')
  items(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Query(new ZodBodyPipe(inventoryPageQuerySchema)) query: InventoryPageQuery,
  ) {
    return this.inventory.listItems(id, query);
  }

  @Post(':id/items')
  @RequirePermissions(
    'inventory.view',
    'inventory.quantity.view',
    'inventory.adjust',
  )
  createItem(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Body(new ZodBodyPipe(createInventoryItemSchema))
    input: CreateInventoryItemInput,
  ) {
    return this.inventory.createItem(actor.id, id, input);
  }

  @Post(':id/items/:itemId/state-transitions')
  @RequirePermissions(
    'inventory.view',
    'inventory.quantity.view',
    'inventory.adjust',
  )
  transitionItem(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Param('itemId', new ZodBodyPipe(cuidParamSchema)) itemId: string,
    @Body(new ZodBodyPipe(transitionInventoryItemSchema))
    input: TransitionInventoryItemInput,
  ) {
    return this.inventory.transitionItem(actor.id, id, itemId, input);
  }

  @Get(':id/transactions')
  @RequirePermissions(
    'inventory.view',
    'inventory.quantity.view',
    'inventory.transaction.view',
  )
  transactions(
    @Param('id', new ZodBodyPipe(cuidParamSchema)) id: string,
    @Query(new ZodBodyPipe(inventoryPageQuerySchema)) query: InventoryPageQuery,
  ) {
    return this.inventory.transactions(id, query);
  }
}
