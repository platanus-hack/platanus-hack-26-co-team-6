import { Module } from '@nestjs/common';
import { AiCoreClient } from './ai-core.client';

@Module({
  providers: [AiCoreClient],
  exports: [AiCoreClient],
})
export class AiCoreModule {}
