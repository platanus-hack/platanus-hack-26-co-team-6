import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { RdaController } from './rda.controller';
import { RdaService } from './rda.service';

/**
 * Pre-llenado del RDA (Resumen Digital de Atención) en FHIR R4.
 *
 * AlmacenModule es @Global: no se importa aquí.
 * Exporta el servicio porque el worker `rda-builder` del plan maestro §1.2 va
 * a llamarlo al cerrar el caso, en vez de duplicar la construcción.
 */
@Module({
  imports: [SedesModule],
  controllers: [RdaController],
  providers: [RdaService],
  exports: [RdaService],
})
export class RdaModule {}
