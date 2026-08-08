import { randomUUID } from 'node:crypto';

import { prisma, runRbacSeed } from '@mensah-rentals/database';
import { beforeAll, describe, expect, it } from 'vitest';

import { CatalogueRepository } from '../catalogue/catalogue.repository';
import { CatalogueService } from '../catalogue/catalogue.service';
import { InventoryService } from '../inventory/inventory.service';
import { expectPublicDataSafe } from '../testing/public-confidentiality.test-utils';
import { MaintenanceService } from './maintenance.service';

describe('maintenance service against PostgreSQL', () => {
  const maintenance = new MaintenanceService();
  const inventory = new InventoryService();
  const catalogue = new CatalogueService(new CatalogueRepository());
  const suffix = randomUUID().replaceAll('-', '');
  let actorId: string;
  let categoryId: string;

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const admin = await prisma.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
    });
    const actor = await prisma.user.create({
      data: {
        email: `maintenance-${suffix}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Maintenance',
        lastName: 'Operator',
        status: 'ACTIVE',
        roles: { create: { roleId: admin.id } },
      },
    });
    actorId = actor.id;
    const category = await prisma.category.create({
      data: {
        name: `Maintenance ${suffix}`,
        slug: `maintenance-${suffix}`,
      },
    });
    categoryId = category.id;
  });

  async function bulk(
    label: string,
    quantity: number,
    initialState: 'RENTABLE' | 'DAMAGED' = 'RENTABLE',
  ) {
    const product = await prisma.product.create({
      data: {
        categoryId,
        name: `${label} ${suffix}`,
        slug: `${label.toLowerCase().replaceAll(' ', '-')}-${suffix}`,
        shortDescription: 'Maintenance integration fixture',
      },
    });
    return inventory.create(actorId, {
      productId: product.id,
      trackingMode: 'BULK',
      initialQuantity: quantity,
      initialState,
      operationId: randomUUID(),
      reason: 'Maintenance integration stock',
    });
  }

  function createInput(
    inventoryId: string,
    quantity: number,
    operationId = randomUUID(),
  ) {
    return {
      operationId,
      source: 'MANUAL' as const,
      type: 'PREVENTIVE' as const,
      priority: 'NORMAL' as const,
      title: 'Preventive workshop service',
      description: 'Inspect, service, and verify equipment.',
      inventoryId,
      quantity,
      sourceState: 'RENTABLE' as const,
    };
  }

  it('moves bulk inventory exactly once and replays creation idempotently', async () => {
    const target = await bulk('Idempotent maintenance', 5);
    const operationId = randomUUID();
    const input = createInput(target.id, 2, operationId);
    const first = (await maintenance.createWorkOrder(actorId, input)) as {
      id: string;
      status: string;
    };
    const replay = (await maintenance.createWorkOrder(actorId, input)) as {
      id: string;
    };
    expect(replay.id).toBe(first.id);
    expect(
      await prisma.maintenanceWorkOrder.count({ where: { id: first.id } }),
    ).toBe(1);
    expect(
      await prisma.inventoryTransaction.count({
        where: {
          inventoryId: target.id,
          action: 'ENTER_MAINTENANCE',
        },
      }),
    ).toBe(1);
    const quantities = await inventory.quantities(target.id);
    expect(quantities.states.RENTABLE).toBe(3);
    expect(quantities.states.MAINTENANCE).toBe(2);
    expect(quantities.totalQuantity).toBe(5);
    await expect(
      maintenance.createWorkOrder(actorId, {
        ...input,
        quantity: 1,
      }),
    ).rejects.toThrow('Operation ID was already used differently');
  });

  it('cancels active work and releases only its owned ingress movement', async () => {
    const target = await bulk('Cancelled maintenance', 4);
    const workOrder = (await maintenance.createWorkOrder(
      actorId,
      createInput(target.id, 2),
    )) as { id: string; version: number };
    await maintenance.cancel(actorId, workOrder.id, {
      operationId: randomUUID(),
      expectedVersion: workOrder.version,
      cancellationReason: 'Work is no longer required.',
    });
    const quantities = await inventory.quantities(target.id);
    expect(quantities.states.RENTABLE).toBe(4);
    expect(quantities.states.MAINTENANCE).toBe(0);
    expect(quantities.totalQuantity).toBe(4);
    expect(
      await prisma.inventoryTransaction.count({
        where: {
          inventoryId: target.id,
          action: 'MAINTENANCE_CANCELLED_RELEASE',
        },
      }),
    ).toBe(1);
  });

  it('serializes concurrent bulk claims so only one excessive command succeeds', async () => {
    const target = await bulk('Concurrent maintenance', 5);
    const results = await Promise.allSettled([
      maintenance.createWorkOrder(actorId, createInput(target.id, 4)),
      maintenance.createWorkOrder(actorId, createInput(target.id, 4)),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const quantities = await inventory.quantities(target.id);
    expect(quantities.states.RENTABLE).toBe(1);
    expect(quantities.states.MAINTENANCE).toBe(4);
    expect(quantities.totalQuantity).toBe(5);
  });

  it('requires inspection and completes return-to-service without changing physical total', async () => {
    const target = await bulk('Lifecycle maintenance', 3);
    let workOrder = (await maintenance.createWorkOrder(
      actorId,
      createInput(target.id, 2),
    )) as { id: string; version: number };
    workOrder = (await maintenance.start(actorId, workOrder.id, {
      operationId: randomUUID(),
      expectedVersion: workOrder.version,
    })) as { id: string; version: number };
    workOrder = (await maintenance.readyForInspection(actorId, workOrder.id, {
      operationId: randomUUID(),
      expectedVersion: workOrder.version,
    })) as { id: string; version: number };
    let inspection = (await maintenance.createInspection(actorId, {
      operationId: randomUUID(),
      type: 'POST_MAINTENANCE',
      inventoryId: target.id,
      quantity: 2,
      sourceWorkOrderId: workOrder.id,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
    })) as { id: string; version: number };
    inspection = (await maintenance.startInspection(actorId, inspection.id, {
      operationId: randomUUID(),
      expectedVersion: inspection.version,
    })) as { id: string; version: number };
    await maintenance.passInspection(actorId, inspection.id, {
      operationId: randomUUID(),
      expectedVersion: inspection.version,
      summary: 'Equipment passed all checks.',
    });
    const completed = (await maintenance.complete(actorId, workOrder.id, {
      operationId: randomUUID(),
      expectedVersion: workOrder.version,
      completionOutcome: 'RETURN_TO_SERVICE',
      completionSummary: 'Service and verification complete.',
      resolveLinkedIssueAsRepaired: false,
    })) as { status: string; completionOutcome: string };
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completionOutcome).toBe('RETURN_TO_SERVICE');
    const quantities = await inventory.quantities(target.id);
    expect(quantities.states.RENTABLE).toBe(3);
    expect(quantities.states.MAINTENANCE).toBe(0);
    expect(quantities.totalQuantity).toBe(3);
  });

  it('records a failed post-maintenance inspection and returns the work order to progress', async () => {
    const target = await bulk('Failed inspection maintenance', 2);
    let workOrder = (await maintenance.createWorkOrder(
      actorId,
      createInput(target.id, 1),
    )) as { id: string; version: number };
    workOrder = (await maintenance.start(actorId, workOrder.id, {
      operationId: randomUUID(),
      expectedVersion: workOrder.version,
    })) as { id: string; version: number };
    workOrder = (await maintenance.readyForInspection(actorId, workOrder.id, {
      operationId: randomUUID(),
      expectedVersion: workOrder.version,
    })) as { id: string; version: number };
    let inspection = (await maintenance.createInspection(actorId, {
      operationId: randomUUID(),
      type: 'POST_MAINTENANCE',
      inventoryId: target.id,
      quantity: 1,
      sourceWorkOrderId: workOrder.id,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
    })) as { id: string; version: number };
    inspection = (await maintenance.startInspection(actorId, inspection.id, {
      operationId: randomUUID(),
      expectedVersion: inspection.version,
    })) as { id: string; version: number };
    await maintenance.failInspection(actorId, inspection.id, {
      operationId: randomUUID(),
      expectedVersion: inspection.version,
      summary: 'Further repair is required.',
    });
    expect(
      await prisma.maintenanceWorkOrder.findUniqueOrThrow({
        where: { id: workOrder.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'IN_PROGRESS' });
    expect(
      await prisma.maintenanceOperation.count({
        where: { workOrderId: workOrder.id, type: 'WORK_RESUMED' },
      }),
    ).toBe(1);
  });

  it('uses the explicitly selected damaged state for mixed-state corrective work', async () => {
    const target = await bulk('Mixed damaged maintenance', 3);
    await inventory.moveBulk(actorId, target.id, {
      operationId: randomUUID(),
      fromState: 'RENTABLE',
      toState: 'DAMAGED',
      quantity: 2,
      reason: 'Create mixed-state maintenance fixture',
    });
    await maintenance.createWorkOrder(actorId, {
      ...createInput(target.id, 1),
      type: 'CORRECTIVE',
      sourceState: 'DAMAGED',
    });
    const quantities = await inventory.quantities(target.id);
    expect(quantities.states.DAMAGED).toBe(1);
    expect(quantities.states.MAINTENANCE).toBe(1);
    expect(quantities.states.RENTABLE).toBe(1);
  });

  it('prevents manual work from claiming stock held by an active routine inspection', async () => {
    const target = await bulk('Inspection owned maintenance', 1);
    const inspection = (await maintenance.createInspection(actorId, {
      operationId: randomUUID(),
      type: 'ROUTINE',
      inventoryId: target.id,
      quantity: 1,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
    })) as { id: string; version: number };
    await maintenance.startInspection(actorId, inspection.id, {
      operationId: randomUUID(),
      expectedVersion: inspection.version,
    });
    await expect(
      maintenance.createWorkOrder(actorId, {
        ...createInput(target.id, 1),
        sourceState: 'MAINTENANCE',
      }),
    ).rejects.toThrow('already assigned');
  });

  it('keeps maintenance records out of public catalogue DTOs', async () => {
    const page = await catalogue.listPublicProducts({
      page: 1,
      pageSize: 100,
      sortBy: 'name',
      sortDirection: 'asc',
    });
    expectPublicDataSafe(page);
    expect(JSON.stringify(page)).not.toMatch(
      /workOrderNumber|inspectionNumber|repairNotes|assignedStaff|maintenanceStatus/i,
    );
  });
});
