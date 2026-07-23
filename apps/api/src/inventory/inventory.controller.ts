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
  bulkInventoryMovementSchema,
  createInventoryItemSchema,
  createInventorySchema,
  cuidParamSchema,
  inventoryListQuerySchema,
  inventoryPageQuerySchema,
  transitionInventoryItemSchema,
  type BulkInventoryMovementInput,
  type CreateInventoryInput,
  type CreateInventoryItemInput,
  type InventoryListQuery,
  type InventoryPageQuery,
  type TransitionInventoryItemInput,
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
