import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { MatchModule } from '../match/match.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { VozModule } from '../voz/voz.module';
import { VigilanteService } from './vigilante.service';

@Module({
  imports: [SedesModule, MatchModule, DispatchModule, VozModule],
  providers: [VigilanteService],
  exports: [VigilanteService],
})
export class VigilanteModule {}
