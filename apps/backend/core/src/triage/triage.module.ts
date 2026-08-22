import { Module } from '@nestjs/common';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';
import { AiCoreModule } from '../ai-core/ai-core.module';

@Module({
  imports: [AiCoreModule],
  controllers: [TriageController],
  providers: [TriageService],
})
export class TriageModule {}
