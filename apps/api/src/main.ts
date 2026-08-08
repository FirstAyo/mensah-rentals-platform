import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { RequestCorrelationMiddleware } from './common/request-correlation';
import { SafeHttpExceptionFilter } from './common/safe-http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<ApiEnvironment, true>);
  const logger = new Logger('Bootstrap');
  const correlation = new RequestCorrelationMiddleware();

  app.use(correlation.use.bind(correlation));
  app.use(cookieParser());
  app.useGlobalFilters(new SafeHttpExceptionFilter());
  app.enableCors({
    credentials: true,
    origin: config.get('ADMIN_ORIGIN', { infer: true }),
  });
  app.enableShutdownHooks();
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () =>
      logger.log({ event: 'api_shutdown_started', signal }),
    );

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  logger.log({ event: 'api_started', port });
}

void bootstrap();
