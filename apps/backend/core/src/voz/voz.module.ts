import { Module } from '@nestjs/common';
import { VozClient } from './voz.client';

@Module({
  providers: [VozClient],
  exports: [VozClient],
})
export class VozModule {}
