import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { EtaModule } from '../eta/eta.module';
import { ScoringModule } from '../scoring/scoring.module';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';

@Module({
  imports: [SedesModule, EtaModule, ScoringModule],
  controllers: [MatchController],
  providers: [MatchService],
})
export class MatchModule {}
