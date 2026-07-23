import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { InventoryModule } from './inventory.module';
import { InventoryService } from './inventory.service';

const baseUser: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'inventory@example.test',
  firstName: 'Inventory',
  id: 'staff-id',
  lastLoginAt: null,
  lastName: 'Tester',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};

describe('inventory HTTP authorization', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const inventory = {
    list: vi.fn(async () => ({
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    quantities: vi.fn(async () => ({
      inventoryId: 'id',
      states: {},
      totalQuantity: 0,
    })),
    moveBulk: vi.fn(async () => ({
      inventoryId: 'id',
      states: {},
      totalQuantity: 0,
    })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ADMIN_ORIGIN: 'http://localhost:3001',
              STAFF_SESSION_COOKIE_NAME: 'mensah_staff_session',
            }),
          ],
        }),
        AuthModule,
        InventoryModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(InventoryService)
      .useValue(inventory)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns 401 unauthenticated and 403 without inventory.view', async () => {
    await request(app.getHttpServer()).get('/admin/inventory').expect(401);
    current = baseUser;
    await request(app.getHttpServer())
      .get('/admin/inventory')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
  });

  it('keeps metadata and confidential quantities under separate permissions', async () => {
    current = { ...baseUser, permissionKeys: ['inventory.view'] };
    await request(app.getHttpServer())
      .get('/admin/inventory')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
    await request(app.getHttpServer())
      .get('/admin/inventory/cm00000000000000000000000/quantities')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
    current = {
      ...baseUser,
      permissionKeys: ['inventory.view', 'inventory.quantity.view'],
    };
    await request(app.getHttpServer())
      .get('/admin/inventory/cm00000000000000000000000/quantities')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200);
  });

  it('requires adjustment permission for a mutation', async () => {
    current = {
      ...baseUser,
      permissionKeys: ['inventory.view', 'inventory.quantity.view'],
    };
    const call = () =>
      request(app.getHttpServer())
        .post('/admin/inventory/cm00000000000000000000000/bulk-movements')
        .set('Cookie', 'mensah_staff_session=x')
        .set('Origin', 'http://localhost:3001')
        .set('Content-Type', 'application/json')
        .send({
          fromState: 'RENTABLE',
          toState: 'MAINTENANCE',
          quantity: 1,
          operationId: '7e57d004-2b97-4e7a-b45f-5387367791cd',
          reason: 'Authorization test movement',
        });
    await call().expect(403);
    current = {
      ...baseUser,
      permissionKeys: [
        'inventory.view',
        'inventory.quantity.view',
        'inventory.adjust',
      ],
    };
    await call().expect(201);
    expect(inventory.moveBulk).toHaveBeenCalled();
  });
});
