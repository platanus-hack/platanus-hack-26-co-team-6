import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { VozModule } from '../voz/voz.module';
import { CapacidadesController } from './capacidades.controller';
import { CapacidadesService } from './capacidades.service';

@Module({
  imports: [SedesModule, VozModule],
  controllers: [CapacidadesController],
  providers: [CapacidadesService],
})
export class CapacidadesModule {}
