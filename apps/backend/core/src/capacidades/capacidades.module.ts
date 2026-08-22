import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { AiCoreModule } from '../ai-core/ai-core.module';
import { CapacidadesController } from './capacidades.controller';
import { CapacidadesService } from './capacidades.service';

@Module({
  imports: [SedesModule, AiCoreModule],
  controllers: [CapacidadesController],
  providers: [CapacidadesService],
})
export class CapacidadesModule {}
