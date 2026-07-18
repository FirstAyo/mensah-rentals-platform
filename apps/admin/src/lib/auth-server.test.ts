import { describe, expect, it, vi } from 'vitest';

import { requestCurrentStaffUser } from './auth-server';

describe('server-side staff session validation', () => {
  it('returns null without a cookie and does not call the API', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(requestCurrentStaffUser('', fetcher)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns null for an unauthorized API response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Authentication required' }), {
        status: 401,
      }),
    );
    await expect(
      requestCurrentStaffUser('mensah_staff_session=opaque', fetcher),
    ).resolves.toBeNull();
  });

  it('returns a safe user with no-store session validation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        user: {
          email: 'staff@example.com',
          id: 'staff-id',
        },
      }),
    );
    const user = await requestCurrentStaffUser(
      'mensah_staff_session=opaque',
      fetcher,
    );

    expect(user?.email).toBe('staff@example.com');
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:4000/auth/me',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
