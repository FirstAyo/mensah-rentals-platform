import { describe, expect, it } from 'vitest';

import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  verifyPassword,
} from './index';

describe('authentication primitives', () => {
  it('hashes and verifies passwords with Argon2id', async () => {
    const passwordHash = await hashPassword('a-development-test-password');

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    await expect(
      verifyPassword(passwordHash, 'a-development-test-password'),
    ).resolves.toBe(true);
    await expect(
      verifyPassword(passwordHash, 'incorrect-password'),
    ).resolves.toBe(false);
  });

  it('normalizes staff email addresses consistently', () => {
    expect(normalizeEmail(' Staff.User@Example.COM ')).toBe(
      'staff.user@example.com',
    );
  });

  it('creates an opaque token and stores a deterministic digest', () => {
    const sessionToken = createSessionToken();

    expect(sessionToken.rawToken).not.toBe(sessionToken.tokenHash);
    expect(sessionToken.tokenHash).toHaveLength(64);
    expect(hashSessionToken(sessionToken.rawToken)).toBe(
      sessionToken.tokenHash,
    );
  });
});
