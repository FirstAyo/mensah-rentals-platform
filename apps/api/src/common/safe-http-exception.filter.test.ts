import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { SafeHttpExceptionFilter } from './safe-http-exception.filter';

describe('safe HTTP exception filter', () => {
  it('replaces server-side HttpException details with a generic response', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          path: '/admin/reports',
          requestId: 'request-id',
        }),
        getResponse: () => ({ status }),
      }),
    };
    new SafeHttpExceptionFilter().catch(
      new HttpException('postgresql://secret@internal/db', 500),
      host as never,
    );
    expect(json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'The request could not be completed',
      requestId: 'request-id',
      statusCode: 500,
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('postgresql://');
  });
});
