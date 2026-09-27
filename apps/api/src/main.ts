import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { findMissingSecrets, REQUIRED_API_SECRETS, intEnv, optionalEnv } from '@signalkit/config';

/**
 * API bootstrap.
 *
 * Security law: in production, the process must fail fast and clearly if a
 * critical secret is missing. Secrets are never logged.
 */
async function bootstrap(): Promise<void> {
  if (optionalEnv('NODE_ENV', 'development') === 'production') {
    const missing = findMissingSecrets(REQUIRED_API_SECRETS);
    if (missing.length > 0) {
      throw new Error(`Cannot start API: missing required secrets: ${missing.join(', ')}`);
    }
  }

  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const corsOrigins = optionalEnv('CORS_ORIGINS', '*');
  app.enableCors({ origin: corsOrigins === '*' ? true : corsOrigins.split(',') });

  // OpenAPI / Swagger at /docs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SignalKit API')
    .setDescription('Evidence-backed market opportunity discovery platform API.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // Bind all interfaces explicitly so the API is reachable from outside its
  // container regardless of how the runtime resolves the default host.
  const port = intEnv('PORT', 4000);
  const host = optionalEnv('HOST', '0.0.0.0');
  await app.listen(port, host);
  console.log(`SignalKit API listening on ${host}:${port}`);
}

void bootstrap();
