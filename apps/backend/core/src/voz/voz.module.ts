import { Module } from '@nestjs/common';
import { AiCoreModule } from '../ai-core/ai-core.module';
import { VozClient } from './voz.client';
import { TranscripcionController } from './transcripcion.controller';

/**
 * Los dos sentidos de la voz, que son cosas distintas:
 *   VozClient               SALIDA  — avisar por WhatsApp/telefonía (servicio `voz`)
 *   TranscripcionController ENTRADA — el dictado del paramédico, vía ai-core
 */
@Module({
  imports: [AiCoreModule],
  controllers: [TranscripcionController],
  providers: [VozClient],
  exports: [VozClient],
})
export class VozModule {}
