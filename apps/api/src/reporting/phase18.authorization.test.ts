import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { SystemStatusModule } from '../system/system-status.module';
import { SystemStatusService } from '../system/system-status.service';
import { ReportingModule } from './reporting.module';
import { ReportingService } from './reporting.service';

const base: StaffUserResponse = {
  createdAt: new Date(0).toISOString(),
  email: 'phase18@example.test',
  firstName: 'Phase',
  id: 'phase18-staff',
  lastLoginAt: null,
  lastName: 'Reporter',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: new Date(0).toISOString(),
};

const emptyReport = {
  generatedAt: new Date(0).toISOString(),
  metrics: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  range: {
    endDate: '2026-08-08',
    startDate: '2026-08-01',
    timeZone: 'Africa/Accra',
  },
  rows: [],
};

describe('Phase 18 HTTP authorization boundaries', () => {
  let app: INestApplication;
  let current: StaffUserResponse | null = null;
  const reporting = {
    overview: vi.fn(async () => ({ ...emptyReport, availableReportKeys: [] })),
    rentalRequests: vi.fn(async () => emptyReport),
    quotesOrders: vi.fn(async () => emptyReport),
    rentalsReturns: vi.fn(async () => emptyReport),
    inventory: vi.fn(async () => emptyReport),
    maintenance: vi.fn(async () => emptyReport),
    exportReport: vi.fn(async () => ({
      csv: 'reference\r\nMR-1\r\n',
      filename: 'report.csv',
      rowCount: 1,
    })),
  };
  const audit = {
    list: vi.fn(async () => emptyReport),
    detail: vi.fn(async () => ({
      action: 'CREATED',
      id: 'audit-id',
      source: 'PLATFORM',
      summary: 'Safe audit event',
    })),
    export: vi.fn(async () => ({
      csv: 'summary\r\nSafe audit event\r\n',
      filename: 'audit.csv',
      rowCount: 1,
    })),
  };
  const system = {
    status: vi.fn(async () => ({ database: { status: 'ready' } })),
    backupStatus: vi.fn(async () => ({ status: 'verified' })),
  };
  const cookie = ['mensah_staff_session=x'];

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
        ReportingModule,
        AuditModule,
        SystemStatusModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          current ? { sessionId: 'session', user: current } : null,
        ),
      })
      .overrideProvider(ReportingService)
      .useValue(reporting)
      .overrideProvider(AuditService)
      .useValue(audit)
      .overrideProvider(SystemStatusService)
      .useValue(system)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns 401 unauthenticated and 403 without report permissions', async () => {
    await request(app.getHttpServer())
      .get('/admin/reports/rental-requests')
      .expect(401);
    current = base;
    await request(app.getHttpServer())
      .get('/admin/reports/rental-requests')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('requires the exact underlying domain permission for report data', async () => {
    current = { ...base, permissionKeys: ['report.view'] };
    await request(app.getHttpServer())
      .get('/admin/reports/rental-requests')
      .set('Cookie', cookie)
      .expect(403);
    current = {
      ...base,
      permissionKeys: ['report.view', 'rental_request.view'],
    };
    await request(app.getHttpServer())
      .get('/admin/reports/rental-requests')
      .set('Cookie', cookie)
      .expect(200);
    expect(reporting.rentalRequests).toHaveBeenCalledOnce();
  });

  it('denies exports to view-only staff and observes live permission changes', async () => {
    const send = () =>
      request(app.getHttpServer())
        .post('/admin/reports/rental-requests/export')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3001')
        .send({ preset: 'LAST_30_DAYS' });
    current = {
      ...base,
      permissionKeys: ['report.view', 'rental_request.view'],
    };
    await send().expect(403);
    current = {
      ...base,
      permissionKeys: ['report.view', 'report.export', 'rental_request.view'],
    };
    await send().expect(201);
    current = {
      ...base,
      permissionKeys: ['report.view', 'rental_request.view'],
    };
    await send().expect(403);
  });

  it('protects audit list, detail and export independently', async () => {
    current = base;
    await request(app.getHttpServer())
      .get('/admin/audit/PLATFORM/audit-id')
      .set('Cookie', cookie)
      .expect(403);
    current = { ...base, permissionKeys: ['audit_log.view'] };
    await request(app.getHttpServer())
      .get('/admin/audit/PLATFORM/audit-id')
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/admin/audit/export')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send({ preset: 'LAST_30_DAYS' })
      .expect(403);
    current = {
      ...base,
      permissionKeys: ['audit_log.view', 'audit_log.export'],
    };
    await request(app.getHttpServer())
      .post('/admin/audit/export')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3001')
      .send({ preset: 'LAST_30_DAYS' })
      .expect(201);
  });

  it('separates observability from backup-status permissions', async () => {
    current = { ...base, permissionKeys: ['observability.view'] };
    await request(app.getHttpServer())
      .get('/admin/system/status')
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get('/admin/system/backup-status')
      .set('Cookie', cookie)
      .expect(403);
    current = { ...base, permissionKeys: ['backup.view_status'] };
    await request(app.getHttpServer())
      .get('/admin/system/status')
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/system/backup-status')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('does not mount reporting, audit, or system data under public routes', async () => {
    current = null;
    await request(app.getHttpServer()).get('/public/reports').expect(404);
    await request(app.getHttpServer()).get('/public/audit').expect(404);
    await request(app.getHttpServer()).get('/public/system/status').expect(404);
  });
});
