import { Module } from '@nestjs/common';
import { EtaService } from './eta.service';

@Module({
  providers: [EtaService],
  exports: [EtaService],
})
export class EtaModule {}
