/**
 * Administracion de plataforma — tarea 5.11.
 *
 * Catalogos clinicos versionados (motivos de rechazo, protocolos, mapa
 * Dx→servicios) y versiones de los artefactos con los que se procesa un caso
 * (prompt clinico, config de scoring), con auditoria append-only.
 *
 * ── QUE APORTA AL RESTO DE CORE ───────────────────────────────────
 * Exporta `CatalogosService`. El metodo que le interesa al pipeline es
 * `decidir(dx, propuestoPorLlm)`: implementa §7.2 —el LLM propone, la tabla
 * decide— y devuelve `escala-a-criterio-humano` cuando la tabla no sabe.
 * Hoy no lo llama nadie: cablearlo toca `triage/`, que es dominio de otra
 * tarea (0.5 / 3.12).
 *
 * ── DE DONDE SALE EL ALMACEN ──────────────────────────────────────
 * `AlmacenAdminMemoria` y punto. No hay factory con `PULSO_..._DATABASE_URL`
 * como en `PersistenceModule` porque todavia no existe la implementacion
 * Postgres: una factory que solo puede devolver una cosa aparenta una eleccion
 * que no existe. La tabla ya esta en `supabase/migrations/0008`; cuando llegue
 * `AlmacenAdminPostgres`, este es el unico sitio que cambia.
 */

import { Logger, Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';
import { ModelosController } from './modelos.controller';
import { ModelosService } from './modelos.service';
import { ALMACEN_ADMIN, AlmacenAdminMemoria } from './almacen-admin';

@Module({
  controllers: [AdminController, CatalogosController, ModelosController],
  providers: [
    AdminGuard,
    CatalogosService,
    ModelosService,
    {
      provide: ALMACEN_ADMIN,
      useFactory: () => {
        // El aviso va aqui y no en la clase: se da UNA vez, al arrancar core,
        // y no en cada `new` de un test. Un log que se repite treinta veces
        // deja de leerse, que es lo mismo que no avisar.
        new Logger('AdminModule').warn(
          'Catálogos versionados en MEMORIA: un reinicio de core borra las versiones ' +
            'que se firmen en /admin. Aplica supabase/migrations/0008 y conecta el ' +
            'almacén Postgres antes de usarlo con un comité real.',
        );
        return new AlmacenAdminMemoria();
      },
    },
  ],
  exports: [CatalogosService, ModelosService],
})
export class AdminModule {}
