import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { MaintenanceModule } from './maintenance.module';
import { MaintenanceService } from './maintenance.service';

const id = 'cm00000000000000000000000';
const command = {
  operationId: '00000000-0000-4000-8000-000000000001',
  expectedVersion: 0,
};
const base: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'maintenance@example.test',
  firstName: 'Maintenance',
  id: 'staff',
  lastLoginAt: null,
  lastName: 'Staff',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};

describe('maintenance HTTP authorization', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const service = Object.fromEntries(
    [
      'listWorkOrders',
      'workOrder',
      'createWorkOrder',
      'assign',
      'unassign',
      'updateWorkOrder',
      'start',
      'waitingForParts',
      'resume',
      'readyForInspection',
      'complete',
      'cancel',
      'addNote',
      'listInspections',
      'inspection',
      'createInspection',
      'startInspection',
      'passInspection',
      'failInspection',
      'cancelInspection',
      'assignees',
      'issueSource',
      'returnItemSource',
    ].map((name) => [name, vi.fn(async () => ({ id }))]),
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ADMIN_ORIGIN: 'http://localhost:3001',
              STAFF_SESSION_COOKIE_NAME: 'mensah_staff_session',
              WEB_ORIGIN: 'http://localhost:3000',
            }),
          ],
        }),
        AuthModule,
        MaintenanceModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(MaintenanceService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());
  const cookie = ['mensah_staff_session=x'];

  it('returns 401 unauthenticated, 403 without view, and 200 with maintenance.view', async () => {
    await request(app.getHttpServer())
      .get('/admin/maintenance/work-orders')
      .expect(401);
    current = base;
    await request(app.getHttpServer())
      .get('/admin/maintenance/work-orders')
      .set('Cookie', cookie)
      .expect(403);
    current = { ...base, permissionKeys: ['maintenance.view'] };
    await request(app.getHttpServer())
      .get('/admin/maintenance/work-orders')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('does not infer maintenance creation from inventory, return, or issue permissions', async () => {
    const body = {
      operationId: command.operationId,
      source: 'MANUAL',
      sourceState: 'RENTABLE',
      type: 'PREVENTIVE',
      priority: 'NORMAL',
      title: 'Inspect chair batch',
      description: 'Preventive inspection.',
      inventoryId: id,
      quantity: 1,
    };
    current = {
      ...base,
      permissionKeys: [
        'inventory.adjust',
        'return.reconcile',
        'rental_issue.resolve',
      ],
    };
    await request(app.getHttpServer())
      .post('/admin/maintenance/work-orders')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(body)
      .expect(403);
    current = { ...base, permissionKeys: ['maintenance.create'] };
    await request(app.getHttpServer())
      .post('/admin/maintenance/work-orders')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(body)
      .expect(201);
  });

  it('requires exact action permissions and rejects foreign origins', async () => {
    current = { ...base, permissionKeys: ['maintenance.view'] };
    await request(app.getHttpServer())
      .post(`/admin/maintenance/work-orders/${id}/start`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(command)
      .expect(403);
    current = { ...base, permissionKeys: ['maintenance.update'] };
    await request(app.getHttpServer())
      .post(`/admin/maintenance/work-orders/${id}/start`)
      .set('Cookie', cookie)
      .set('Origin', 'https://attacker.invalid')
      .send(command)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/admin/maintenance/work-orders/${id}/start`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(command)
      .expect(201);
  });

  it('requires both completion and inventory-transition permissions', async () => {
    const body = {
      ...command,
      completionOutcome: 'RETURN_TO_SERVICE',
      completionSummary: 'Repair and inspection completed.',
    };
    current = { ...base, permissionKeys: ['maintenance.complete'] };
    await request(app.getHttpServer())
      .post(`/admin/maintenance/work-orders/${id}/complete`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(body)
      .expect(403);
    current = {
      ...base,
      permissionKeys: [
        'maintenance.complete',
        'maintenance.inventory_transition',
      ],
    };
    await request(app.getHttpServer())
      .post(`/admin/maintenance/work-orders/${id}/complete`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(body)
      .expect(201);
  });

  it('keeps inspection performance independent from maintenance view', async () => {
    current = { ...base, permissionKeys: ['maintenance.view'] };
    await request(app.getHttpServer())
      .post(`/admin/maintenance/inspections/${id}/start`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(command)
      .expect(403);
    current = { ...base, permissionKeys: ['inspection.perform'] };
    await request(app.getHttpServer())
      .post(`/admin/maintenance/inspections/${id}/start`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(command)
      .expect(201);
  });
});
