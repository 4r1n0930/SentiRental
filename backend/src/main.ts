import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<AppConfig>(APP_CONFIG);

  app.getHttpAdapter().getInstance().set('trust proxy', config.app.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: config.app.isProduction ? undefined : false,
    }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix(config.app.apiPrefix, { exclude: ['health', 'health/ready'] });

  app.enableCors({
    origin: config.app.corsOrigins,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.enableShutdownHooks();

  if (config.app.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('SentiRental API')
        .setDescription('Property, room, tenant and rental agreement management for SentiRental.')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    );

    SwaggerModule.setup(`${config.app.apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(config.app.port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.warn(`API listening on port ${config.app.port} (${config.app.env})`);
}

void bootstrap();
