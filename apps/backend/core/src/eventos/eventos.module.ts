/**
 * Eventos del caso — tarea 3.1.
 *
 * @Global porque lo va a inyectar medio core: handshake, dispatch, vigilante,
 * escalamiento, triage y los guards. Hacer que cada uno lo importe seria
 * repetir el mismo import doce veces para nada.
 */

import { Global, Module } from '@nestjs/common';
import {
  ALMACEN_EVENTOS,
  EventosMemoria,
  proveedorEventos,
} from './almacen-eventos';
import { EventosController } from './eventos.controller';
import { RegistroService } from './registro.service';

@Global()
@Module({
  controllers: [EventosController],
  providers: [EventosMemoria, proveedorEventos, RegistroService],
  exports: [RegistroService, ALMACEN_EVENTOS],
})
export class EventosModule {}
