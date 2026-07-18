import type { INestApplication } from '@nestjs/common';
import { Controller, Get, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { hashPassword } from '@mensah-rentals/auth';
import type { StaffUserResponse } from '@mensah-rentals/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthModule } from './auth.module';
import { AuthRepository } from './auth.repository';
import type { StaffCredentialRecord, ValidStaffSession } from './auth.types';
import { Public } from './public.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';

@Controller('test-protected')
class ProtectedTestController {
  @Get()
  getProtected(): { status: string } {
    return { status: 'authenticated' };
  }

  @Get('permission')
  @RequirePermissions('role.view')
  getPermissionProtected(): { status: string } {
    return { status: 'authorized' };
  }
}

@Public()
@Controller('test-public')
class PublicTestController {
  @Get()
  getPublic(): { status: string } {
    return { status: 'public' };
  }

  @Post()
  postPublic(): { status: string } {
    return { status: 'public' };
  }
}

class InMemoryAuthRepository extends AuthRepository {
  user: StaffCredentialRecord | null = null;
  private readonly sessions = new Map<
    string,
    { expiresAt: Date; id: string; user: StaffUserResponse }
  >();

  override async findUserForLogin(
    email: string,
  ): Promise<StaffCredentialRecord | null> {
    return this.user?.email === email ? this.user : null;
  }

  override async createSessionAndUpdateLogin(input: {
    expiresAt: Date;
    loggedInAt: Date;
    tokenHash: string;
    userId: string;
  }): Promise<ValidStaffSession> {
    if (!this.user || this.user.id !== input.userId) {
      throw new Error('Test user not found');
    }

    this.user = { ...this.user, lastLoginAt: input.loggedInAt };
    const safeUser = this.safeUser(this.user);
    this.sessions.set(input.tokenHash, {
      expiresAt: input.expiresAt,
      id: `session-${this.sessions.size + 1}`,
      user: safeUser,
    });
    return { sessionId: `session-${this.sessions.size}`, user: safeUser };
  }

  override async findValidSession(
    tokenHash: string,
    now: Date,
  ): Promise<ValidStaffSession | null> {
    const session = this.sessions.get(tokenHash);
    if (
      !session ||
      session.expiresAt <= now ||
      this.user?.status !== 'ACTIVE'
    ) {
      return null;
    }
    return { sessionId: session.id, user: this.safeUser(this.user) };
  }

  override async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  private safeUser(user: StaffCredentialRecord): StaffUserResponse {
    return {
      createdAt: user.createdAt.toISOString(),
      email: user.email,
      firstName: user.firstName,
      id: user.id,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      lastName: user.lastName,
      permissionKeys: [
        ...new Set(
          user.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.key),
          ),
        ),
      ],
      roles: user.roles.map(({ role }) => ({
        displayName: role.displayName,
        id: role.id,
        name: role.name,
      })),
      status: user.status,
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}

describe('staff authentication HTTP flow', () => {
  let app: INestApplication;
  let repository: InMemoryAuthRepository;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword('correct-development-password');
    const module = await Test.createTestingModule({
      controllers: [ProtectedTestController, PublicTestController],
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
      .overrideProvider(AuthRepository)
      .useClass(InMemoryAuthRepository)
      .compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    repository = app.get(AuthRepository) as InMemoryAuthRepository;
  });

  afterAll(async () => {
    await app.close();
  });

  function setUser(
    status: 'ACTIVE' | 'DISABLED' = 'ACTIVE',
    permissionKeys: string[] = [],
  ) {
    repository.user = {
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      email: 'staff@example.com',
      firstName: 'Staff',
      id: 'staff-id',
      lastLoginAt: null,
      lastName: 'Member',
      passwordHash,
      roles:
        permissionKeys.length === 0
          ? []
          : [
              {
                role: {
                  displayName: 'Test Role',
                  id: 'role-id',
                  name: 'TEST_ROLE',
                  permissions: permissionKeys.map((key) => ({
                    permission: { key },
                  })),
                },
              },
            ],
      status,
      updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    };
  }

  it('keeps public routes public and denies an undecorated route', async () => {
    await request(app.getHttpServer()).get('/test-public').expect(200);
    await request(app.getHttpServer())
      .post('/test-public')
      .send({})
      .expect(201);
    await request(app.getHttpServer()).get('/test-protected').expect(401);
  });

  it('returns 401, 403, and 200 at the authentication/permission boundaries', async () => {
    await request(app.getHttpServer())
      .get('/test-protected/permission')
      .expect(401);

    setUser();
    const noPermissionAgent = request.agent(app.getHttpServer());
    await noPermissionAgent
      .post('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({
        email: 'staff@example.com',
        password: 'correct-development-password',
      })
      .expect(200);
    await noPermissionAgent.get('/test-protected/permission').expect(403);

    setUser('ACTIVE', ['role.view']);
    const authorizedAgent = request.agent(app.getHttpServer());
    await authorizedAgent
      .post('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({
        email: 'staff@example.com',
        password: 'correct-development-password',
      })
      .expect(200);
    await authorizedAgent
      .get('/test-protected/permission')
      .expect(200, { status: 'authorized' });
  });

  it('applies permission revocation and restoration on the next request without relogin', async () => {
    setUser('ACTIVE', ['role.view']);
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({
        email: 'staff@example.com',
        password: 'correct-development-password',
      })
      .expect(200);
    await agent.get('/test-protected/permission').expect(200);

    setUser('ACTIVE', []);
    await agent.get('/test-protected/permission').expect(403);

    setUser('ACTIVE', ['role.view']);
    await agent.get('/test-protected/permission').expect(200);
  });

  it('logs in, reads the current user, logs out, and rejects replay', async () => {
    setUser();
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .set('Content-Type', 'application/json')
      .send({
        email: 'STAFF@example.com',
        password: 'correct-development-password',
      })
      .expect(200);

    const setCookie = login.headers['set-cookie'] as unknown as string[];
    const originalSessionCookie = setCookie[0]?.split(';', 1)[0];
    expect(originalSessionCookie).toBeTruthy();
    expect(setCookie[0]).toContain('HttpOnly');
    expect(setCookie[0]).toContain('SameSite=Lax');
    expect(setCookie[0]).toContain('Path=/');
    expect(setCookie[0]).not.toContain('Secure');
    expect(JSON.stringify(login.body)).not.toContain('passwordHash');

    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.user.email).toBe('staff@example.com');
    expect(JSON.stringify(me.body)).not.toContain('tokenHash');

    const logout = await agent
      .post('/auth/logout')
      .set('Origin', 'http://localhost:3001')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(204);
    expect((logout.headers['set-cookie'] as unknown as string[])[0]).toContain(
      'Expires=',
    );
    await agent.get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', originalSessionCookie ?? '')
      .expect(401);
  });

  it('returns an identical generic error for wrong password and unknown email', async () => {
    setUser();
    const wrong = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({ email: 'staff@example.com', password: 'wrong-password' })
      .expect(401);
    const unknown = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({ email: 'unknown@example.com', password: 'wrong-password' })
      .expect(401);

    expect(unknown.body).toEqual(wrong.body);
  });

  it('rejects disabled users and immediately invalidates their existing session', async () => {
    setUser();
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({
        email: 'staff@example.com',
        password: 'correct-development-password',
      })
      .expect(200);

    setUser('DISABLED');
    await agent.get('/auth/me').expect(401);
    await agent
      .post('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({
        email: 'staff@example.com',
        password: 'correct-development-password',
      })
      .expect(401);
  });

  it('rejects foreign and missing Origins on state-changing auth requests', async () => {
    setUser();
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://attacker.invalid')
      .send({
        email: 'staff@example.com',
        password: 'correct-development-password',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(403);
  });

  it('clears a stale cookie through idempotent logout', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', 'http://localhost:3001')
      .set('Cookie', 'mensah_staff_session=stale-token')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(204);

    expect(
      (response.headers['set-cookie'] as unknown as string[])[0],
    ).toContain('mensah_staff_session=');
  });
});
