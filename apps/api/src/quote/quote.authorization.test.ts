import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { QuoteModule } from './quote.module';
import { QuoteService } from './quote.service';

const id = 'cm00000000000000000000000';
const revisionId = 'cm00000000000000000000001';
const base: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'staff@example.test',
  firstName: 'Quote',
  id: 'staff',
  lastLoginAt: null,
  lastName: 'Staff',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};
const revisionBody = {
  operationId: '00000000-0000-4000-8000-000000000000',
  items: [
    {
      rentalRequestDecisionItemId: id,
      quotedQuantity: 1,
      unitPriceCents: 100,
      taxable: true,
    },
  ],
  charges: [],
  discountCents: 0,
  discountTaxable: true,
  tax: { name: 'Tax', rateBasisPoints: 0 },
  validUntil: '2027-01-01T00:00:00.000Z',
};

describe('quote HTTP authorization', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const service = {
    list: vi.fn(async () => ({
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    createFirst: vi.fn(async () => ({ id })),
    createRevision: vi.fn(async () => ({ id: revisionId })),
    send: vi.fn(async () => ({ status: 'SENT' })),
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
        QuoteModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(QuoteService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });
  afterAll(async () => app.close());
  const cookie = ['mensah_staff_session=x'];
  it('returns 401 unauthenticated and 403 without quote.view', async () => {
    await request(app.getHttpServer()).get('/admin/quotes').expect(401);
    current = base;
    await request(app.getHttpServer())
      .get('/admin/quotes')
      .set('Cookie', cookie)
      .expect(403);
    current = { ...base, permissionKeys: ['quote.view'] };
    await request(app.getHttpServer())
      .get('/admin/quotes')
      .set('Cookie', cookie)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
  });
  it('returns 422 for invalid quote query and path input', async () => {
    current = { ...base, permissionKeys: ['quote.view'] };
    await request(app.getHttpServer())
      .get('/admin/quotes?page=0')
      .set('Cookie', cookie)
      .expect(422);
    await request(app.getHttpServer())
      .get('/admin/quotes/not-a-cuid')
      .set('Cookie', cookie)
      .expect(422);
  });
  it('requires rental_request.view and quote.create independently', async () => {
    const call = () =>
      request(app.getHttpServer())
        .post(`/admin/rental-requests/${id}/quotes`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3001')
        .send(revisionBody);
    current = { ...base, permissionKeys: ['quote.create'] };
    await call().expect(403);
    current = { ...base, permissionKeys: ['rental_request.view'] };
    await call().expect(403);
    current = {
      ...base,
      permissionKeys: ['rental_request.view', 'quote.create'],
    };
    await call().expect(201);
  });
  it('requires quote.update and quote.send independently', async () => {
    const revise = () =>
      request(app.getHttpServer())
        .post(`/admin/quotes/${id}/revisions`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3001')
        .send({ ...revisionBody, expectedLatestRevisionNumber: 1 });
    current = { ...base, permissionKeys: ['quote.view'] };
    await revise().expect(403);
    current = { ...base, permissionKeys: ['quote.update'] };
    await revise().expect(403);
    current = { ...base, permissionKeys: ['quote.view', 'quote.update'] };
    await revise().expect(201);
    const send = () =>
      request(app.getHttpServer())
        .post(`/admin/quotes/${id}/revisions/${revisionId}/send`)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3001')
        .send({
          operationId: '00000000-0000-4000-8000-000000000001',
          expectedLifecycleVersion: 0,
        });
    current = { ...base, permissionKeys: ['quote.view'] };
    await send().expect(403);
    current = { ...base, permissionKeys: ['quote.view', 'quote.send'] };
    await send().expect(201);
  });
});
