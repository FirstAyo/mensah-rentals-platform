import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<ApiEnvironment, true>);

  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    origin: config.get('ADMIN_ORIGIN', { infer: true }),
  });
  app.enableShutdownHooks();

  await app.listen(config.get('API_PORT', { infer: true }));
}

void bootstrap();
