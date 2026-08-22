import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { ScoringModule } from '../scoring/scoring.module';
import { VozModule } from '../voz/voz.module';
import { HandshakeController } from './handshake.controller';
import { HandshakeService } from './handshake.service';

@Module({
  imports: [SedesModule, ScoringModule, VozModule],
  controllers: [HandshakeController],
  providers: [HandshakeService],
  exports: [HandshakeService],
})
export class HandshakeModule {}
