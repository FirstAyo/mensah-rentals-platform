import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyFeatureSettings } from './feature-settings-proxy';

describe('feature settings fixed BFF', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('forwards the configured public Admin origin behind an internal HTTP proxy', async () => {
    vi.stubEnv('ADMIN_ORIGIN', 'https://admin-staging.mensahrentals.com');
    const fetcher = vi.fn(async () =>
      Response.json({ blockers: [], changes: [], requiresReason: false }),
    );
    const response = await proxyFeatureSettings(
      new Request(
        'http://mensah-staging-admin:3001/api/feature-settings/presets/preview',
        {
          body: JSON.stringify({ preset: 'FULL_OPERATIONS' }),
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://admin-staging.mensahrentals.com',
          },
          method: 'POST',
        },
      ),
      ['presets', 'preview'],
      fetcher as unknown as typeof fetch,
    );

    expect(response.status).toBe(200);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('origin')).toBe(
      'https://admin-staging.mensahrentals.com',
    );
  });

  it('still rejects a browser request from an untrusted origin', async () => {
    vi.stubEnv('ADMIN_ORIGIN', 'https://admin-staging.mensahrentals.com');
    const fetcher = vi.fn();
    const response = await proxyFeatureSettings(
      new Request(
        'http://mensah-staging-admin:3001/api/feature-settings/presets/preview',
        {
          body: JSON.stringify({ preset: 'FULL_OPERATIONS' }),
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://attacker.invalid',
          },
          method: 'POST',
        },
      ),
      ['presets', 'preview'],
      fetcher as unknown as typeof fetch,
    );

    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
