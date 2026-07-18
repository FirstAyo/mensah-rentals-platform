import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const checkConnection = vi.fn<() => Promise<void>>();
  let service: HealthService;

  beforeEach(() => {
    checkConnection.mockReset();
    service = new HealthService({ checkConnection } as DatabaseService);
  });

  it('reports API liveness without sensitive configuration', () => {
    expect(service.getApiHealth()).toEqual({
      service: 'mensah-rentals-api',
      status: 'ok',
    });
  });

  it('reports successful database connectivity after a real service check', async () => {
    checkConnection.mockResolvedValue();

    await expect(service.getDatabaseHealth()).resolves.toEqual({
      database: 'connected',
      status: 'ok',
    });
  });

  it('returns a sanitized service-unavailable error when PostgreSQL is down', async () => {
    checkConnection.mockRejectedValue(new Error('secret connection details'));

    await expect(service.getDatabaseHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
