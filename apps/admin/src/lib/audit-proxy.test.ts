import { describe, expect, it, vi } from 'vitest';
import { proxyAudit } from './audit-proxy';

describe('audit fixed BFF', () => {
  it('allows only list, safe details and export', async () => {
    expect(
      (await proxyAudit(new Request('http://localhost:3001/api/audit'), []))
        .status,
    ).toBe(503);
    expect(
      (
        await proxyAudit(
          new Request('http://localhost:3001/api/audit/../../secrets'),
          ['..', '..', 'secrets'],
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyAudit(
          new Request('http://localhost:3001/api/audit/example/delete', {
            method: 'DELETE',
          }),
          ['example', 'delete'],
        )
      ).status,
    ).toBe(404);
  });

  it('rejects unknown filters and foreign export origins', async () => {
    expect(
      (
        await proxyAudit(
          new Request('http://localhost:3001/api/audit?rawBody=true'),
          [],
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await proxyAudit(
          new Request('http://localhost:3001/api/audit/export', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: 'https://attacker.invalid',
            },
            body: '{}',
          }),
          ['export'],
        )
      ).status,
    ).toBe(403);
  });

  it('marks successful detail responses private and noindex', async () => {
    const response = await proxyAudit(
      new Request('http://localhost:3001/api/audit/source/event'),
      ['source', 'event'],
      vi.fn(async () =>
        Response.json({
          id: 'event',
          source: 'source',
          occurredAt: '2026-08-08T00:00:00.000Z',
          actor: null,
          domain: 'AUTH',
          action: 'LOGIN',
          entity: null,
          summary: 'Staff login recorded.',
          metadata: null,
        }),
      ) as unknown as typeof fetch,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });
});
