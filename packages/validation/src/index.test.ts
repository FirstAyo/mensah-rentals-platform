import { describe, expect, it } from 'vitest';

import {
  apiEnvironmentSchema,
  staffBootstrapEnvironmentSchema,
  staffLoginSchema,
} from './index';

describe('staff login validation', () => {
  it('normalizes valid login input', () => {
    expect(
      staffLoginSchema.parse({
        email: ' Staff.User@Example.COM ',
        password: 'test-password',
      }),
    ).toEqual({
      email: 'staff.user@example.com',
      password: 'test-password',
    });
  });

  it.each([
    { email: 'not-an-email', password: 'test-password' },
    { email: 'staff@example.com', password: '' },
    { email: 'staff@example.com', password: 'x'.repeat(129) },
    { email: 'staff@example.com', password: 'test-password', unexpected: true },
  ])('rejects invalid or unexpected login input', (input) => {
    expect(staffLoginSchema.safeParse(input).success).toBe(false);
  });
});

describe('authentication environment validation', () => {
  it('rejects insecure production cookie settings', () => {
    expect(
      apiEnvironmentSchema.safeParse({
        AUTH_COOKIE_SECURE: 'false',
        DATABASE_URL: 'postgresql://example.invalid/database',
        NODE_ENV: 'production',
        STAFF_SESSION_COOKIE_NAME: 'mensah_staff_session',
      }).success,
    ).toBe(false);
  });

  it('validates development bootstrap credentials', () => {
    expect(
      staffBootstrapEnvironmentSchema.safeParse({
        NODE_ENV: 'development',
        STAFF_BOOTSTRAP_EMAIL: 'staff@example.com',
        STAFF_BOOTSTRAP_FIRST_NAME: 'Staff',
        STAFF_BOOTSTRAP_LAST_NAME: 'User',
        STAFF_BOOTSTRAP_PASSWORD: 'long-enough-password',
      }).success,
    ).toBe(true);
  });

  it.each([undefined, 'production', 'test'])(
    'rejects bootstrap when NODE_ENV is %s',
    (nodeEnvironment) => {
      expect(
        staffBootstrapEnvironmentSchema.safeParse({
          NODE_ENV: nodeEnvironment,
          STAFF_BOOTSTRAP_EMAIL: 'staff@example.com',
          STAFF_BOOTSTRAP_FIRST_NAME: 'Staff',
          STAFF_BOOTSTRAP_LAST_NAME: 'User',
          STAFF_BOOTSTRAP_PASSWORD: 'long-enough-password',
        }).success,
      ).toBe(false);
    },
  );
});
