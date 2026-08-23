/**
 * Equipo e invitaciones (tarea 2.5).
 *
 * ── DONDE VIVE EL ESTADO ───────────────────────────────────────────
 * En memoria, y lo dice al arrancar. Mismo criterio que `PersistenceModule`:
 * el repo entero corre sin una sola credencial y este modulo no es la
 * excepcion. La diferencia con el ruteo es que aqui todavia NO hay
 * implementacion de Postgres, y no por pereza: las tablas `organizacion` y
 * `actor` las crea la tarea 1.1, y un almacen que las lea antes de que existan
 * seria codigo muerto que nadie puede probar.
 *
 * Lo que si esta listo para ese dia:
 *   · `supabase/migrations/0005_invitaciones.sql` crea la tabla `invitacion`.
 *   · `AlmacenEquipo` es la interfaz contra la que ya programa el dominio.
 *   · Este `useFactory` es el unico sitio donde se elige la implementacion.
 */

import { Logger, Module } from '@nestjs/common';
import { ALMACEN_EQUIPO } from './almacen-equipo';
import { AlmacenEquipoMemoria } from './almacen-equipo.memoria';
import { CorreoService } from './correo.service';
import { EquipoController } from './equipo.controller';
import { IdentidadService } from './identidad.service';
import { InvitacionController } from './invitacion.controller';
import { InvitacionesService } from './invitaciones.service';

const log = new Logger('InvitacionesModule');

@Module({
  controllers: [EquipoController, InvitacionController],
  providers: [
    InvitacionesService,
    IdentidadService,
    CorreoService,
    AlmacenEquipoMemoria,
    {
      provide: ALMACEN_EQUIPO,
      inject: [AlmacenEquipoMemoria],
      useFactory: (memoria: AlmacenEquipoMemoria) => {
        log.warn(
          'Equipo e invitaciones viven en memoria: se pierden al reiniciar y ' +
            'no se comparten entre instancias. La tabla `invitacion` esta en ' +
            'supabase/migrations/0005_invitaciones.sql y el almacen de Postgres ' +
            'llega cuando existan `organizacion` y `actor` (tarea 1.1).',
        );
        return memoria;
      },
    },
  ],
  exports: [InvitacionesService, IdentidadService],
})
export class InvitacionesModule {}
