import { Module } from '@nestjs/common';
import { EscalamientoController } from './escalamiento.controller';
import { EscalamientoService } from './escalamiento.service';

// AlmacenModule es @Global: no se importa aquí.
@Module({
  controllers: [EscalamientoController],
  providers: [EscalamientoService],
  // Lo usa VigilanteService cuando se agotan los candidatos de un caso.
  exports: [EscalamientoService],
})
export class EscalamientoModule {}
