import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // core es el único origen que ve el navegador. ai-core es interno y no lleva CORS.
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000',
  });

  // 3001, no el 3000 por defecto de Nest — apps/frontend es dueño del 3000 en
  // desarrollo. El fallback vive aquí a propósito: un clon fresco sin .env no
  // puede colisionar.
  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);

  Logger.log(`PULSO core escuchando en http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
