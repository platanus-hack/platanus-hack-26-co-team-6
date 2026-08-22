import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { raw } from 'express';
import { AppModule } from './app.module';

/** Un dictado de ambulancia dura segundos; 15 MB es holgado de sobra. */
const MAX_AUDIO_MB = 15;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // El dictado llega como audio binario, no como JSON. Sin esto el parser por
  // defecto intentaría leer un webm como texto y fallaría con un error de
  // sintaxis que no dice nada del problema real.
  //
  // Va antes que nada: express aplica los middlewares en orden de registro y
  // este tiene que ganarle al body parser de Nest.
  app.use(
    '/voz/transcribir',
    raw({ type: 'audio/*', limit: `${MAX_AUDIO_MB}mb` }),
  );

  // core es el único origen que ve el navegador. ai-core es interno y no lleva CORS.
  // credentials: el navegador solo manda la cookie de sesión si se lo
  // permitimos aquí. Con credentials no vale el comodín '*': el origen tiene
  // que ser exacto, y por eso CORS_ORIGIN nunca puede ser '*'.
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000',
    credentials: true,
  });

  // 3001, no el 3000 por defecto de Nest — apps/frontend es dueño del 3000 en
  // desarrollo. El fallback vive aquí a propósito: un clon fresco sin .env no
  // puede colisionar.
  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);

  Logger.log(`PULSO core escuchando en http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
