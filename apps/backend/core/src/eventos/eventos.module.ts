/**
 * El registro de eventos del caso.
 *
 * @Global igual que AlmacenModule, y por el mismo motivo: la tarea 3.2 va a
 * inyectar `RegistroService` desde una docena de servicios (handshake,
 * dispatch, vigilante, triage, escalamiento…). Declararlo en doce `imports`
 * sería ruido sin información, y la alternativa —que cada uno se acuerde de
 * importarlo— es exactamente cómo se pierden 19 de 22 eventos.
 *
 * La fábrica del almacén es calcada de `PersistenceModule` a propósito,
 * incluido el aviso: sin base de datos el registro vive en memoria **y se
 * dice en el log**. La rama de Postgres la agrega la tarea 3.1.
 */

import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorService } from './actor.service';
import { ALMACEN_EVENTOS, MemoriaAlmacenEventos } from './almacen-eventos';
import {
  EventosController,
  EventosDeCasoController,
} from './eventos.controller';
import { RegistroService } from './registro.service';

const log = new Logger('EventosModule');

@Global()
@Module({
  controllers: [EventosDeCasoController, EventosController],
  providers: [
    ActorService,
    RegistroService,
    {
      provide: ALMACEN_EVENTOS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Se lee la variable aunque todavía no haya adaptador: quien la puso
        // merece saber que no basta, en vez de creer que ya persiste.
        if (config.get<string>('PULSO_EVENTOS_DATABASE_URL')) {
          log.warn(
            'PULSO_EVENTOS_DATABASE_URL está puesta pero el adaptador de ' +
              'Postgres para evento_caso todavía no existe (tarea 3.1). El ' +
              'registro sigue en memoria: se pierde al reiniciar core. La ' +
              'migración ya está escrita en supabase/migrations/0007_evento_caso.sql.',
          );
        } else {
          log.warn(
            'Sin PULSO_EVENTOS_DATABASE_URL — la línea de tiempo de los casos ' +
              'vive en memoria y se pierde al reiniciar core. Sobrevive a ' +
              'recargar el navegador y a cambiar de máquina (ya no es ' +
              'localStorage), pero no a un Ctrl+C.',
          );
        }
        return new MemoriaAlmacenEventos();
      },
    },
  ],
  exports: [RegistroService, ActorService],
})
export class EventosModule {}
