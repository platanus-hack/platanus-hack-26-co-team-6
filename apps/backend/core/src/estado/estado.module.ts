import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { ScoringModule } from '../scoring/scoring.module';
import { EstadoController } from './estado.controller';
import { EstadoService } from './estado.service';

@Module({
  imports: [SedesModule, ScoringModule],
  controllers: [EstadoController],
  providers: [EstadoService],
})
export class EstadoModule {}
