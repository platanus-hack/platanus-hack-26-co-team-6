import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { EtaModule } from '../eta/eta.module';
import { CanalesModule } from '../canales/canales.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [SedesModule, EtaModule, CanalesModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
