/**
 * GET /estado — estado vivo del sistema.
 *
 * GET /estado?casoId=xxx → filtra a un solo caso.
 * Antes vivía en apps/frontend/app/api/estado/route.ts.
 */

import { Controller, Get, Query } from '@nestjs/common';
import { Alcance } from '../auth/rol.decorator';
import { EstadoService, type EstadoResponse } from './estado.service';

@Controller('estado')
export class EstadoController {
  constructor(private readonly estado: EstadoService) {}

  /**
   * `@Alcance('caso:leer')` — tarea 5.9.
   *
   * Abre esta ruta, y SOLO esta, a las llaves de API con ese alcance: es lo
   * que el HIS de un hospital necesita para leer el estado de sus casos. Las
   * personas no cambian en nada — el decorador solo lo mira `RolGuard` cuando
   * quien pregunta es una llave, y una ruta sin el no la admite ninguna.
   *
   * ⚠️ El alcance por ORGANIZACION de esta respuesta todavia no existe: hoy
   *    `/estado` devuelve todo lo que hay en memoria. Lo cierra el aislamiento
   *    de inquilino (1.5 y 1.6). Hasta entonces, no repartan llaves fuera del
   *    equipo.
   */
  @Alcance('caso:leer')
  @Get()
  async instantanea(@Query('casoId') casoId?: string): Promise<EstadoResponse> {
    return this.estado.instantanea(casoId);
  }
}
