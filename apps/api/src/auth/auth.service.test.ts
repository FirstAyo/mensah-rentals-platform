import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StaffUserResponse } from '@mensah-rentals/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import type { StaffCredentialRecord } from './auth.types';
import type { PasswordService } from './password.service';

const now = new Date('2026-07-18T08:00:00.000Z');

const credential: StaffCredentialRecord = {
  createdAt: now,
  email: 'staff@example.com',
  firstName: 'Staff',
  id: 'staff-id',
  lastLoginAt: null,
  lastName: 'Member',
  passwordHash: 'stored-password-hash',
  roles: [],
  status: 'ACTIVE',
  updatedAt: now,
};

const safeUser: StaffUserResponse = {
  createdAt: credential.createdAt.toISOString(),
  email: credential.email,
  firstName: credential.firstName,
  id: credential.id,
  lastLoginAt: null,
  lastName: credential.lastName,
  permissionKeys: [],
  roles: [],
  status: credential.status,
  updatedAt: credential.updatedAt.toISOString(),
};

describe('AuthService', () => {
  const findUserForLogin = vi.fn();
  const createSessionAndUpdateLogin = vi.fn();
  const findValidSession = vi.fn();
  const deleteSession = vi.fn();
  const verify = vi.fn();
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(
      {
        createSessionAndUpdateLogin,
        deleteSession,
        findUserForLogin,
        findValidSession,
      } as unknown as AuthRepository,
      { verify } as unknown as PasswordService,
      new ConfigService({ STAFF_SESSION_TTL_HOURS: 12 }),
    );
  });

  it('creates a hashed session and returns only the safe user', async () => {
    findUserForLogin.mockResolvedValue(credential);
    verify.mockResolvedValue(true);
    createSessionAndUpdateLogin.mockResolvedValue({
      sessionId: 'session-id',
      user: safeUser,
    });

    const result = await service.login({
      email: credential.email,
      password: 'correct-password',
    });

    expect(result.rawToken).toBeTruthy();
    expect(createSessionAndUpdateLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userId: credential.id,
      }),
    );
    expect(JSON.stringify(service.toResponse(result.user))).not.toContain(
      'passwordHash',
    );
  });

  it('returns the same generic error for a bad password and unknown email', async () => {
    findUserForLogin
      .mockResolvedValueOnce(credential)
      .mockResolvedValueOnce(null);
    verify.mockResolvedValue(false);

    const badPasswordError = await service
      .login({ email: credential.email, password: 'wrong-password' })
      .catch((error: unknown) => error);
    const unknownEmailError = await service
      .login({ email: 'unknown@example.com', password: 'wrong-password' })
      .catch((error: unknown) => error);

    expect(badPasswordError).toBeInstanceOf(UnauthorizedException);
    expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
    expect((badPasswordError as UnauthorizedException).getResponse()).toEqual(
      (unknownEmailError as UnauthorizedException).getResponse(),
    );
    expect(verify).toHaveBeenLastCalledWith(null, 'wrong-password');
  });

  it('verifies then rejects a disabled staff user generically', async () => {
    findUserForLogin.mockResolvedValue({ ...credential, status: 'DISABLED' });
    verify.mockResolvedValue(true);

    await expect(
      service.login({ email: credential.email, password: 'correct-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).toHaveBeenCalledWith(
      credential.passwordHash,
      'correct-password',
    );
    expect(createSessionAndUpdateLogin).not.toHaveBeenCalled();
  });

  it('rejects generically if the account is disabled during session creation', async () => {
    findUserForLogin.mockResolvedValue(credential);
    verify.mockResolvedValue(true);
    createSessionAndUpdateLogin.mockResolvedValue(null);

    await expect(
      service.login({ email: credential.email, password: 'correct-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validates an authenticated session and rejects a missing token', async () => {
    findValidSession.mockResolvedValue({
      sessionId: 'session-id',
      user: safeUser,
    });

    await expect(service.validateSession('opaque-token')).resolves.toEqual({
      sessionId: 'session-id',
      user: safeUser,
    });
    await expect(service.validateSession(undefined)).resolves.toBeNull();
  });

  it('invalidates only the presented session on logout', async () => {
    await service.logout('opaque-token');

    expect(deleteSession).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });
});
