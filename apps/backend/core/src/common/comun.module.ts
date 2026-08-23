/**
 * Lo transversal — tarea 2.11.
 *
 * Los dos se registran GLOBALES a proposito, con la misma logica que el
 * `SesionGuard`: una ruta nueva queda cubierta sin que nadie se acuerde. Lo
 * que se olvida de poner es exactamente lo que falla en produccion.
 *
 * Orden: el limite de tasa corre ANTES que la idempotencia. Si fuera al
 * reves, una tormenta de reintentos se pagaria en trabajo de almacen antes
 * de rebotar.
 */

import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import {
  ALMACEN_IDEMPOTENCIA,
  IdempotenciaMemoria,
  proveedorIdempotencia,
} from './idempotencia';
import { IdempotenciaInterceptor } from './idempotencia.interceptor';
import { LimiteTasaGuard } from './limite-tasa';

@Global()
@Module({
  providers: [
    IdempotenciaMemoria,
    proveedorIdempotencia,
    { provide: APP_GUARD, useClass: LimiteTasaGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotenciaInterceptor },
  ],
  exports: [ALMACEN_IDEMPOTENCIA],
})
export class ComunModule {}
