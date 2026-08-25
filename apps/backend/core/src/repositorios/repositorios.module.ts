/**
 * De dónde sale `caso` y `handshake`.
 *
 * ⚠️ SIN CONFIGURAR, MEMORIA. Es la regla del repo, y este módulo la sigue
 * calcada de `PersistenceModule`: mismo orden, misma variable, mismo aviso.
 *
 *   1. ALMACEN_STORE=memory        → memoria, aunque haya URL. Para ensayar
 *                                    el demo sin tocar la base.
 *   2. PULSO_ROUTING_DATABASE_URL  → Postgres. Se reusa la MISMA variable que
 *                                    el store de ruteo a propósito: es la
 *                                    misma base, y pedir una segunda sería
 *                                    otra cosa que se puede configurar mal.
 *   3. nada                        → memoria, avisando en el log.
 */

import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { MemoriaRepositorio } from './memoria.repositorio';
import { PostgresRepositorio } from './postgres.repositorio';
import { REPOSITORIO } from './repositorio';

const log = new Logger('RepositoriosModule');

@Global()
@Module({
  providers: [
    MemoriaRepositorio,
    {
      provide: REPOSITORIO,
      inject: [ConfigService, MemoriaRepositorio],
      useFactory: (config: ConfigService, memoria: MemoriaRepositorio) => {
        if (config.get<string>('ALMACEN_STORE') === 'memory') return memoria;

        const url = config.get<string>('PULSO_ROUTING_DATABASE_URL');
        if (url) {
          log.log('Casos y handshakes en Postgres — sobreviven al reinicio.');
          return new PostgresRepositorio(new Pool({ connectionString: url }));
        }

        log.warn(
          'Sin PULSO_ROUTING_DATABASE_URL — casos y handshakes viven en memoria ' +
            'y se pierden al reiniciar. Con eso se va el historial de aceptación ' +
            'por sede, que es lo que alimenta pAceptacion.',
        );
        return memoria;
      },
    },
  ],
  exports: [REPOSITORIO],
})
export class RepositoriosModule {}
