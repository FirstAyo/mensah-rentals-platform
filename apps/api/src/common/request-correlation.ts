import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const storage = new AsyncLocalStorage<Readonly<{ requestId: string }>>();

export interface CorrelatedRequest extends Request {
  requestId?: string;
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function selectRequestId(
  incoming: string | string[] | undefined,
  trustIncoming: boolean,
): string {
  const candidate = Array.isArray(incoming) ? undefined : incoming;
  return trustIncoming && candidate && SAFE_REQUEST_ID.test(candidate)
    ? candidate
    : randomUUID();
}

@Injectable()
export class RequestCorrelationMiddleware implements NestMiddleware {
  use(request: CorrelatedRequest, response: Response, next: NextFunction) {
    const requestId = selectRequestId(
      request.headers['x-request-id'],
      process.env.TRUST_PROXY_REQUEST_ID === 'true',
    );
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    storage.run({ requestId }, next);
  }
}
