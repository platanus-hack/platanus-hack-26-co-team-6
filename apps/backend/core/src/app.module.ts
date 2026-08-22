import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { AlmacenModule } from './almacen/almacen.module';
import { SedesModule } from './sedes/sedes.module';
import { EtaModule } from './eta/eta.module';
import { ScoringModule } from './scoring/scoring.module';
import { CanalesModule } from './canales/canales.module';
import { HandshakeModule } from './handshake/handshake.module';
import { MatchModule } from './match/match.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { EstadoModule } from './estado/estado.module';
import { TriageModule } from './triage/triage.module';
import { TelegramModule } from './telegram/telegram.module';
import { PulsoErrorFilter } from './common/pulso-error.filter';
import { RoutingModule } from './routing/routing.module';

@Module({
  imports: [
    // isGlobal para que ConfigService se inyecte sin re-importarlo en cada
    // módulo. Sin esto, `apps/backend/core/.env` no lo lee nadie y las
    // credenciales fallan en silencio.
    ConfigModule.forRoot({ isGlobal: true }),
    RoutingModule,

    // Estado de sesión (@Global): casos, handshakes e historial de aceptación.
    AlmacenModule,

    // Dominio.
    SedesModule,
    EtaModule,
    ScoringModule,
    CanalesModule,
    HandshakeModule,

    // Endpoints.
    MatchModule,
    DispatchModule,
    EstadoModule,
    TriageModule,
    TelegramModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: PulsoErrorFilter }],
})
export class AppModule {}
