import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import type { CorrelatedRequest } from './request-correlation';

@Catch()
export class SafeHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<CorrelatedRequest>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error({
        errorClass:
          exception instanceof Error ? exception.constructor.name : 'Unknown',
        event: 'api_request_failed',
        method: request.method,
        path: request.path,
        requestId: request.requestId,
        status,
      });
    }

    if (exception instanceof HttpException && status < 500) {
      response.status(status).json(exception.getResponse());
      return;
    }

    response.status(status).json({
      error: 'Internal Server Error',
      message: 'The request could not be completed',
      requestId: request.requestId,
      statusCode: status,
    });
  }
}
