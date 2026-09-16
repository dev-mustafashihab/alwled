import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Secure by default: no CORS reflection unless origins are explicitly configured.
  // "*" reflects any origin but never together with credentials.
  const allowAll = origins.includes('*');
  app.enableCors({
    origin: allowAll ? true : origins.length ? origins : false,
    credentials: !allowAll,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
  if (!origins.length) {
    new Logger('Bootstrap').warn('CORS_ORIGINS is not configured — cross-origin requests are denied.');
  }
  app.use('/api/v1/auth', rateLimit({ windowMs: 60_000, max: 40, standardHeaders: true, legacyHeaders: false }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  // Swagger is a development tool: in production it must be opted in explicitly.
  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true';
  if (!swaggerEnabled) {
    new Logger('Bootstrap').log('Swagger disabled (set SWAGGER_ENABLED=true to expose /api/docs).');
    await app.listen(process.env.PORT ?? 3100, '0.0.0.0');
    new Logger('Bootstrap').log(`API :${process.env.PORT ?? 3100}`);
    return;
  }
  const config = new DocumentBuilder()
    .setTitle('Alwled Store API')
    .setDescription('متجر الأجهزة الكهربائية — الواجهة الخلفية (المرحلة الأولى)')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(process.env.PORT ?? 3100, '0.0.0.0');
  new Logger('Bootstrap').log(`API :${process.env.PORT ?? 3100} — swagger /api/docs`);
}
bootstrap();
