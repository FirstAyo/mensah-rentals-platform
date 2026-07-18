import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { AuthorizationService } from './authorization.service';

const baseUser: StaffUserResponse = {
  createdAt: '2026-07-18T00:00:00.000Z',
  email: 'staff@example.com',
  firstName: 'Staff',
  id: 'staff-id',
  lastLoginAt: null,
  lastName: 'Member',
  permissionKeys: [],
  roles: [],
  status: 'ACTIVE',
  updatedAt: '2026-07-18T00:00:00.000Z',
};

describe('real administrative RBAC route guards', () => {
  let app: INestApplication;
  let currentUser: StaffUserResponse | null = null;
  const listRoles = vi.fn(async () => [
    {
      createdAt: baseUser.createdAt,
      description: 'Test role',
      displayName: 'Test Role',
      id: 'role-id',
      isSystem: false,
      name: 'TEST_ROLE',
      permissionCount: 1,
      updatedAt: baseUser.updatedAt,
    },
  ]);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ADMIN_ORIGIN: 'http://localhost:3001',
              AUTH_COOKIE_SECURE: false,
              AUTH_LOGIN_RATE_LIMIT: 100,
              AUTH_LOGIN_RATE_WINDOW_SECONDS: 60,
              STAFF_SESSION_COOKIE_NAME: 'mensah_staff_session',
              STAFF_SESSION_TTL_HOURS: 12,
            }),
          ],
        }),
        AuthModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateSession: vi.fn(async () =>
          currentUser ? { sessionId: 'session-id', user: currentUser } : null,
        ),
      })
      .overrideProvider(AuthorizationService)
      .useValue({ listRoles })
      .compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns 401 without a valid staff session', async () => {
    currentUser = null;
    await request(app.getHttpServer())
      .get('/admin/roles')
      .set('Cookie', 'mensah_staff_session=opaque')
      .expect(401);
  });

  it('returns 403 when the authenticated staff user lacks role.view', async () => {
    currentUser = baseUser;
    await request(app.getHttpServer())
      .get('/admin/roles')
      .set('Cookie', 'mensah_staff_session=opaque')
      .expect(403);
    expect(listRoles).not.toHaveBeenCalled();
  });

  it('calls the real controller only when role.view is effective', async () => {
    currentUser = { ...baseUser, permissionKeys: ['role.view'] };
    const response = await request(app.getHttpServer())
      .get('/admin/roles')
      .set('Cookie', 'mensah_staff_session=opaque')
      .expect(200);
    expect(response.body[0]).toMatchObject({ name: 'TEST_ROLE' });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash/);
  });
});
