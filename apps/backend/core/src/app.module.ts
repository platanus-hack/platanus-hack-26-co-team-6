import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { AlmacenModule } from './almacen/almacen.module';
import { RepositoriosModule } from './repositorios/repositorios.module';
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
import { RoutingModule } from './routing/routing.module';
import { EscalamientoModule } from './escalamiento/escalamiento.module';
import { CapacidadesModule } from './capacidades/capacidades.module';
import { AdminModule } from './admin/admin.module';
import { EventosModule } from './eventos/eventos.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { InvitacionesModule } from './invitaciones/invitaciones.module';
import { RdaModule } from './rda/rda.module';
import { AfiliacionModule } from './afiliacion/afiliacion.module';
import { MovilesModule } from './moviles/moviles.module';

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

    // Estado de sesión (@Global): casos, handshakes e historial de aceptación.
    // De dónde salen caso y handshake. @Global, va antes que AlmacenModule.
    RepositoriosModule,
    AlmacenModule,

    // La línea de tiempo del caso (@Global). Punto único de escritura de
    // evento_caso y el sitio donde se resuelve quién es el actor. Va antes de
    // los módulos de dominio porque la tarea 3.2 va a inyectarlo en casi
    // todos.
    EventosModule,

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

    // Catálogos clínicos versionados y versiones de prompt/scoring (5.11).
    // Solo admin_plataforma; todo cambio deja evento. Su guard es propio y
    // corre DESPUÉS del global: aquí no basta con tener sesión.
    AdminModule,
    // El expediente forense de un caso: GET /auditoria/casos/:id.
    AuditoriaModule,
    // Cómo entra el segundo humano de una organización: equipo e invitaciones.
    InvitacionesModule,
    // Quién puede estar en el sistema: autoverificación contra el REPS y alta
    // de organizaciones. Sus dos endpoints públicos están justificados en
    // afiliacion.controller.ts.
    AfiliacionModule,
    // Posición del móvil en vivo y cobertura de ciudad (tarea 3.7).
    MovilesModule,

    // Pre-llenado del RDA en FHIR R4 (tarea 4.8). Pre-llena, NO reporta al
    // IHCE: el borrador queda pendiente hasta que un humano lo firme.
    RdaModule,

    // El que vigila el reloj: vence handshakes, re-rutea y detecta demoras.
    VigilanteModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: PulsoErrorFilter }],
})
export class AppModule {}
