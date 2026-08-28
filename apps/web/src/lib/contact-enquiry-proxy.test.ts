import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyContactEnquiry } from './contact-enquiry-proxy';

function submission(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    email: 'customer@example.test',
    enquiryType: 'GENERAL',
    message: 'A sufficiently detailed public enquiry.',
    name: 'Customer Name',
    operationId: '54d3e83f-ff6b-4b06-b965-98cb69f80df8',
    website: '',
    ...overrides,
  });
}

describe('fixed contact enquiry BFF proxy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects foreign origins, non-JSON, and oversized bodies before fetch', async () => {
    const fetcher = vi.fn();
    const foreign = await proxyContactEnquiry(
      new Request('http://localhost:3000/api/contact-enquiries', {
        body: submission(),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
        method: 'POST',
      }),
      fetcher,
    );
    expect(foreign.status).toBe(403);
    const plain = await proxyContactEnquiry(
      new Request('http://localhost:3000/api/contact-enquiries', {
        body: submission(),
        headers: { Origin: 'http://localhost:3000' },
        method: 'POST',
      }),
      fetcher,
    );
    expect(plain.status).toBe(415);
    const oversized = await proxyContactEnquiry(
      new Request('http://localhost:3000/api/contact-enquiries', {
        body: 'x'.repeat(9000),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        method: 'POST',
      }),
      fetcher,
    );
    expect(oversized.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards to only the fixed public endpoint and validates the receipt', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4000');
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          accepted: true,
          message: 'Received.',
          referenceNumber: 'ENQ-20260828-ABC12345',
        },
        { status: 202 },
      ),
    );
    const response = await proxyContactEnquiry(
      new Request('http://localhost:3000/api/contact-enquiries', {
        body: submission(),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        method: 'POST',
      }),
      fetcher,
    );
    expect(response.status).toBe(202);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/public/contact-enquiries',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(JSON.stringify(await response.json())).not.toMatch(
      /inventory|staff|permission|payloadHash|operationId|session|capability/i,
    );
  });

  it('fails closed on an unsafe successful upstream response', async () => {
    const response = await proxyContactEnquiry(
      new Request('http://localhost:3000/api/contact-enquiries', {
        body: submission(),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        method: 'POST',
      }),
      vi.fn(async () =>
        Response.json(
          { accepted: true, passwordHash: 'secret' },
          { status: 202 },
        ),
      ),
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret');
  });
});
