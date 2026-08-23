import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { AlmacenModule } from './almacen/almacen.module';
import { AiCoreModule } from './ai-core/ai-core.module';
import { VozModule } from './voz/voz.module';
import { VigilanteModule } from './vigilante/vigilante.module';
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
import { ComunModule } from './common/comun.module';
import { RoutingModule } from './routing/routing.module';
import { EscalamientoModule } from './escalamiento/escalamiento.module';
import { CapacidadesModule } from './capacidades/capacidades.module';
import { CatalogoModule } from './catalogo/catalogo.module';

@Module({
  imports: [
    // isGlobal para que ConfigService se inyecte sin re-importarlo en cada
    // módulo. Sin esto, `apps/backend/core/.env` no lo lee nadie y las
    // credenciales fallan en silencio.
    ConfigModule.forRoot({ isGlobal: true }),
    RoutingModule,

    // Habilita @Interval. Sin esto el vigilante no corre y nadie mira el reloj.
    ScheduleModule.forRoot(),

    // Sesión de operador. Registra el APP_GUARD global: desde aquí toda
    // ruta exige sesión salvo las marcadas con @Publico(). Va primero a
    // propósito — es la puerta, no una feature más.
    AuthModule,

    // Idempotencia por `Idempotency-Key` y límite de tasa por actor y por
    // organización. Después de AuthModule porque los dos leen el actor que
    // deja el SesionGuard.
    ComunModule,

    // Estado de sesión (@Global): casos, handshakes e historial de aceptación.
    AlmacenModule,

    // Costura con el servicio interno de IA. Único dueño de AI_CORE_BASE_URL.
    AiCoreModule,

    // Canal publico (WhatsApp, telefonia). Opcional: sin VOZ_BASE_URL se salta.
    VozModule,

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
    // En qué modo corre cada integración. Lo lee la barra de /campo.
    CapacidadesModule,
    // Catálogos versionados (motivos de rechazo). Los lee /hospital.
    CatalogoModule,

    // El que vigila el reloj: vence handshakes, re-rutea y detecta demoras.
    VigilanteModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: PulsoErrorFilter }],
})
export class AppModule {}
