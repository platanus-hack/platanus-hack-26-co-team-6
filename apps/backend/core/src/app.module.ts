import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
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
import { EscalamientoModule } from './escalamiento/escalamiento.module';
import { VozModule } from './voz/voz.module';
import { CapacidadesModule } from './capacidades/capacidades.module';

@Module({
  imports: [
    // isGlobal para que ConfigService se inyecte sin re-importarlo en cada
    // módulo. Sin esto, `apps/backend/core/.env` no lo lee nadie y las
    // credenciales fallan en silencio.
    ConfigModule.forRoot({ isGlobal: true }),

    // Sesión de operador. Registra el APP_GUARD global: desde aquí toda
    // ruta exige sesión salvo las marcadas con @Publico(). Va primero a
    // propósito — es la puerta, no una feature más.
    AuthModule,

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
    // Cuando el ruteo automático no cierra, el caso pasa a un regulador.
    EscalamientoModule,
    // Transcripción de servidor (Deepgram) para los navegadores sin Web Speech.
    VozModule,
    // En qué modo corre cada integración. Lo lee la barra de /campo.
    CapacidadesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
