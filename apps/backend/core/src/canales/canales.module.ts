import { Module } from '@nestjs/common';
import { CanalesService } from './canales.service';

@Module({
  providers: [CanalesService],
  exports: [CanalesService],
})
export class CanalesModule {}
