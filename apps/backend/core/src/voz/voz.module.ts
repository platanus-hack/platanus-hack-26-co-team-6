import { Module } from '@nestjs/common';
import { VozController } from './voz.controller';
import { VozService } from './voz.service';

@Module({
  controllers: [VozController],
  providers: [VozService],
  // CapacidadesService pregunta si la transcripción de servidor está activa.
  exports: [VozService],
})
export class VozModule {}
