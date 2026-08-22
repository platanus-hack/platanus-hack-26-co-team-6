/**
 * De dónde sale el estado de ruteo.
 *
 * ⚠️ SIN CONFIGURAR, MEMORIA. No es una preferencia: es la regla del repo.
 *
 *    "Funciona sin ninguna credencial" está en el README, en `doctor` y en
 *    cada servicio — SupabaseService cae a semillas, EtaService estima por
 *    distancia, TriageService usa el extractor heurístico. Ninguno revienta.
 *
 *    Este módulo hacía lo contrario: exigía PULSO_ROUTING_DATABASE_URL y
 *    tumbaba el arranque entero si faltaba. Con un `.env` recién creado por
 *    `task setup:env` —que no documenta la variable— core no levantaba, y el
 *    error hablaba de una URL que no aparece en ninguna plantilla.
 *
 * El orden es explícito y en este orden a propósito:
 *   1. ROUTING_STORE=memory        → memoria, aunque haya URL. Sirve para
 *                                    ensayar el demo sin tocar la base.
 *   2. PULSO_ROUTING_DATABASE_URL  → Postgres. Si te tomaste el trabajo de
 *                                    ponerla, es porque la quieres usar.
 *   3. nada                        → memoria, avisando en el log.
 */

import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { MemoryRoutingStore } from './memory-routing.store';
import { PostgresRoutingStore } from './postgres-routing.store';
import { ROUTING_STORE } from './routing-store';

const log = new Logger('PersistenceModule');

@Module({
  providers: [
    MemoryRoutingStore,
    {
      provide: ROUTING_STORE,
      inject: [ConfigService, MemoryRoutingStore],
      useFactory: (config: ConfigService, memory: MemoryRoutingStore) => {
        if (config.get<string>('ROUTING_STORE') === 'memory') return memory;

        const url = config.get<string>('PULSO_ROUTING_DATABASE_URL');
        if (url)
          return new PostgresRoutingStore(new Pool({ connectionString: url }));

        // Igual que SedesService con las semillas: se avisa, no se revienta.
        // El estado de ruteo vive en memoria y se pierde al reiniciar, que es
        // exactamente lo que ya hace AlmacenService.
        log.warn(
          'Sin PULSO_ROUTING_DATABASE_URL — el estado de ruteo vive en memoria ' +
            'y se pierde al reiniciar. Pon la URL para persistirlo, o ' +
            'ROUTING_STORE=memory para silenciar este aviso.',
        );
        return memory;
      },
    },
  ],
  exports: [ROUTING_STORE],
})
export class PersistenceModule {}
