import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { EtaController } from './eta.controller';
import { EtaService } from './eta.service';

@Module({
  // El destino se resuelve contra el catálogo: el cliente manda un código de
  // sede, no coordenadas sueltas. Ver el encabezado de eta.controller.ts.
  imports: [SedesModule],
  controllers: [EtaController],
  providers: [EtaService],
  exports: [EtaService],
})
export class EtaModule {}
