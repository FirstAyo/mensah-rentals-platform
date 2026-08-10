import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { ReturnModule } from './return.module';
import { ReturnService } from './return.service';

const id = 'cm00000000000000000000000';
const base: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'returns@example.test',
  firstName: 'Return',
  id: 'staff',
  lastLoginAt: null,
  lastName: 'Staff',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};

describe('return HTTP authorization', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const service = {
    forActiveRental: vi.fn(async () => ({ id })),
    record: vi.fn(async () => ({ id })),
    list: vi.fn(async () => ({
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    })),
    detail: vi.fn(async () => ({ id, activeRentalId: id })),
    reconcile: vi.fn(async () => ({ id })),
    complete: vi.fn(async () => ({ id })),
    createManualIssue: vi.fn(async () => ({ id })),
    issueList: vi.fn(async () => ({
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    })),
    issueDetail: vi.fn(async () => ({ id })),
    resolveIssue: vi.fn(async () => ({ id })),
    pdf: vi.fn(async () => ({
      buffer: Buffer.from('%PDF-1.4'),
      filename: 'return.pdf',
    })),
    officialPdf: vi.fn(async () => ({
      buffer: Buffer.from('%PDF-1.4'),
      filename: 'Mensah-Rentals-Return-RO-TEST.pdf',
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
              WEB_ORIGIN: 'http://localhost:3000',
            }),
          ],
        }),
        AuthModule,
        ReturnModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(ReturnService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });
  afterAll(async () => app.close());
  const cookie = ['mensah_staff_session=x'];

  it('returns 401 unauthenticated, 403 without return.view, and 200 when authorized', async () => {
    await request(app.getHttpServer()).get('/admin/returns').expect(401);
    current = base;
    await request(app.getHttpServer())
      .get('/admin/returns')
      .set('Cookie', cookie)
      .expect(403);
    current = { ...base, permissionKeys: ['return.view'] };
    await request(app.getHttpServer())
      .get('/admin/returns')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('does not infer return creation from view, inventory, order, or checkout permissions', async () => {
    const body = {
      operationId: '00000000-0000-4000-8000-000000000000',
      expectedVersion: 0,
      receivedAt: '2026-07-31T12:00:00.000Z',
      items: [
        {
          activeRentalItemId: id,
          quantityRentable: 1,
          quantityDamaged: 0,
          quantityMaintenance: 0,
          quantityMissing: 0,
          serializedAssets: [],
        },
      ],
    };
    current = {
      ...base,
      permissionKeys: [
        'return.view',
        'inventory.adjust',
        'order.update',
        'fulfilment.checkout',
      ],
    };
    await request(app.getHttpServer())
      .post(`/admin/active-rentals/${id}/return`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(body)
      .expect(403);
    current = { ...base, permissionKeys: ['return.create', 'return.inspect'] };
    await request(app.getHttpServer())
      .post(`/admin/active-rentals/${id}/return`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(body)
      .expect(201);
  });

  it('requires reconcile plus complete and issue resolve plus reconcile', async () => {
    const command = {
      operationId: '00000000-0000-4000-8000-000000000001',
      expectedVersion: 1,
    };
    current = { ...base, permissionKeys: ['return.complete'] };
    await request(app.getHttpServer())
      .post(`/admin/returns/${id}/complete`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(command)
      .expect(403);
    current = {
      ...base,
      permissionKeys: ['return.complete', 'return.reconcile'],
    };
    await request(app.getHttpServer())
      .post(`/admin/returns/${id}/complete`)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send(command)
      .expect(201);
  });

  it('protects the official customer Return Form with staff PDF permissions', async () => {
    current = base;
    await request(app.getHttpServer())
      .get(`/admin/returns/${id}/official-pdf`)
      .set('Cookie', cookie)
      .expect(403);
    current = {
      ...base,
      permissionKeys: ['return.view', 'return.pdf'],
    };
    await request(app.getHttpServer())
      .get(`/admin/returns/${id}/official-pdf`)
      .set('Cookie', cookie)
      .expect(200)
      .expect('Content-Type', /application\/pdf/)
      .expect('Cache-Control', /private, no-store/);
  });
});
