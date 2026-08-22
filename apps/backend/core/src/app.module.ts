import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health/health.controller';
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

@Module({
  imports: [
    // isGlobal para que ConfigService se inyecte sin re-importarlo en cada
    // módulo. Sin esto, `apps/backend/core/.env` no lo lee nadie y las
    // credenciales fallan en silencio.
    ConfigModule.forRoot({ isGlobal: true }),

    // Habilita @Interval. Sin esto el vigilante no corre y nadie mira el reloj.
    ScheduleModule.forRoot(),

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

    // El que vigila el reloj: vence handshakes, re-rutea y detecta demoras.
    VigilanteModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
