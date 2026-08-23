/**
 * GET /auditoria/casos/:id — el expediente forense de un caso.
 *
 * Solo traduce HTTP ↔ dominio: quién pregunta lo resuelve `ActorService`, y
 * si puede o no, `AuditoriaService`. La autorización NO vive aquí a propósito
 * — así el test que prueba que un `admin_organizacion` no ve casos ajenos
 * prueba la regla, no el decorador.
 *
 * El `casoId` va en la URL y eso está bien: es un uuid opaco. Lo que nunca
 * puede ir en una URL es el dictado, el origen o un teléfono (regla 5).
 */

import { Controller, Get, Param, Req } from '@nestjs/common';
import {
  ActorService,
  type SolicitudConSesion,
} from '../eventos/actor.service';
import { AuditoriaService } from './auditoria.service';
import type { ExpedienteCaso } from './auditoria.tipos';

@Controller('auditoria')
export class AuditoriaController {
  constructor(
    private readonly auditoria: AuditoriaService,
    private readonly actores: ActorService,
  ) {}

  @Get('casos/:id')
  expediente(
    @Param('id') casoId: string,
    @Req() req: SolicitudConSesion,
  ): Promise<ExpedienteCaso> {
    return this.auditoria.expediente(casoId, this.actores.deSolicitud(req));
  }
}
