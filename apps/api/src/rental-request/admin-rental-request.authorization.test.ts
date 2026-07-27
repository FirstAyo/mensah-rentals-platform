import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { RentalRequestModule } from './rental-request.module';
import { AdminRentalRequestService } from './admin-rental-request.service';

const requestId = 'cm00000000000000000000000';
const assigneeId = 'cm00000000000000000000001';
const baseUser: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'reviewer@example.test',
  firstName: 'Rental',
  id: 'staff-id',
  lastLoginAt: null,
  lastName: 'Reviewer',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};

describe('administrative rental-request HTTP authorization', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const requests = {
    list: vi.fn(async () => ({
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    assign: vi.fn(async () => ({ id: requestId, reviewVersion: 1 })),
    addNote: vi.fn(async () => ({ id: 'note-id', body: 'Internal note' })),
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
        RentalRequestModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(AdminRentalRequestService)
      .useValue(requests)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns 401 without a staff session and 403 without view permission', async () => {
    await request(app.getHttpServer())
      .get('/admin/rental-requests')
      .expect(401);
    current = baseUser;
    await request(app.getHttpServer())
      .get('/admin/rental-requests')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(403);
    expect(requests.list).not.toHaveBeenCalled();
  });

  it('allows an authenticated staff member with rental_request.view', async () => {
    current = { ...baseUser, permissionKeys: ['rental_request.view'] };
    await request(app.getHttpServer())
      .get('/admin/rental-requests')
      .set('Cookie', 'mensah_staff_session=x')
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(requests.list).toHaveBeenCalled();
  });

  it('requires both view and assignment permissions for assignment', async () => {
    const call = () =>
      request(app.getHttpServer())
        .put(`/admin/rental-requests/${requestId}/assignment`)
        .set('Cookie', 'mensah_staff_session=x')
        .set('Origin', 'http://localhost:3001')
        .send({ assigneeUserId: assigneeId, expectedVersion: 0 });
    current = { ...baseUser, permissionKeys: ['rental_request.view'] };
    await call().expect(403);
    current = { ...baseUser, permissionKeys: ['rental_request.assign'] };
    await call().expect(403);
    current = {
      ...baseUser,
      permissionKeys: ['rental_request.view', 'rental_request.assign'],
    };
    await call().expect(200);
    expect(requests.assign).toHaveBeenCalled();
  });

  it('requires both view and update permissions for internal notes', async () => {
    const call = () =>
      request(app.getHttpServer())
        .post(`/admin/rental-requests/${requestId}/notes`)
        .set('Cookie', 'mensah_staff_session=x')
        .set('Origin', 'http://localhost:3001')
        .send({
          operationId: '7e57d004-2b97-4e7a-b45f-5387367791cd',
          body: 'Internal note',
        });
    current = { ...baseUser, permissionKeys: ['rental_request.view'] };
    await call().expect(403);
    current = { ...baseUser, permissionKeys: ['rental_request.update'] };
    await call().expect(403);
    current = {
      ...baseUser,
      permissionKeys: ['rental_request.view', 'rental_request.update'],
    };
    await call().expect(201);
    expect(requests.addNote).toHaveBeenCalled();
  });
});
