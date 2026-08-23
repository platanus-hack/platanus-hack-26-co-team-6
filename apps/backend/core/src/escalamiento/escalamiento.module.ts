import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { EscalamientoController } from './escalamiento.controller';
import { EscalamientoService } from './escalamiento.service';
import { OverrideController } from './override.controller';

// AlmacenModule y EventosModule son @Global: no se importan aquí.
@Module({
  // El override del CRUE despacha sin pasar por el guard de evidencia del
  // motor — ver EscalamientoService.override(). De ahí esta dependencia.
  imports: [DispatchModule],
  controllers: [EscalamientoController, OverrideController],
  providers: [EscalamientoService],
  // Lo usa VigilanteService cuando se agotan los candidatos de un caso.
  exports: [EscalamientoService],
})
export class EscalamientoModule {}
