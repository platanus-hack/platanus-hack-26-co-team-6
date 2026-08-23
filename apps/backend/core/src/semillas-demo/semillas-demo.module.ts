/**
 * El turno de noche sintético que llena las consolas en el demo.
 *
 * Se registra siempre, pero NO carga nada salvo que `PULSO_DEMO_SINTETICO`
 * valga exactamente 'true'. La decisión vive en el servicio y no aquí para
 * que `GET /demo-sintetico` pueda contestar "apagado" en vez de 404: "no hay
 * datos falsos" es una respuesta útil, y un 404 no la da.
 */

import { Module } from '@nestjs/common';
import { SemillasDemoService } from './semillas-demo.service';
import { SemillasDemoController } from './semillas-demo.controller';

@Module({
  providers: [SemillasDemoService],
  controllers: [SemillasDemoController],
  exports: [SemillasDemoService],
})
export class SemillasDemoModule {}
