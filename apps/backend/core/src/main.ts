import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // core is the only browser-facing origin. ai-core is internal and carries no CORS.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  });

  // 3001, not Nest's default 3000 — apps/frontend owns 3000 in development.
  // The fallback lives here on purpose: a fresh clone with no .env must not collide.
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
