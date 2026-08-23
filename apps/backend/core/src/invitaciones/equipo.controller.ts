/**
 * El equipo de una organizacion: quien esta, quien fue invitado, quien salio.
 *
 *   GET  /organizaciones/:id/equipo
 *   POST /organizaciones/:id/invitaciones
 *   POST /organizaciones/:id/invitaciones/:invitacionId/revocar
 *   POST /organizaciones/:id/actores/:actorId/desactivar
 *   POST /organizaciones/:id/actores/:actorId/reactivar
 *
 * `:id` acepta `mi`, que el servidor resuelve a la organizacion de quien
 * pregunta. Existe porque hoy —sin 1.3— el frontend no conoce su propio id de
 * organizacion, y porque una peticion cuyo inquilino no lo elige el cliente es
 * estrictamente mas segura que una que si.
 *
 * ── NADA DE `DELETE` ───────────────────────────────────────────────
 * No hay ningun verbo `DELETE` en este archivo y no es un descuido. Sacar a
 * alguien es `POST .../desactivar` → `activo = false`. La regla 4 del repo:
 * nadie edita ni borra, una correccion es un evento nuevo.
 *
 * Solo traduce HTTP ↔ dominio; las decisiones estan en InvitacionesService.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IdentidadService,
  type ActorSesion,
  type PeticionConIdentidad,
} from './identidad.service';
import { InvitacionesService } from './invitaciones.service';
import { MensajeHttpFilter } from './mensaje-http.filter';

@UseFilters(MensajeHttpFilter)
@Controller('organizaciones')
export class EquipoController {
  constructor(
    private readonly invitaciones: InvitacionesService,
    private readonly identidad: IdentidadService,
  ) {}

  @Get(':id/equipo')
  equipo(@Req() req: Request, @Param('id') id: string) {
    return this.invitaciones.equipo(this.actor(req), id);
  }

  @Post(':id/invitaciones')
  @HttpCode(201)
  invitar(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() cuerpo: { correo?: unknown; rol?: unknown; codigoSede?: unknown },
  ) {
    return this.invitaciones.invitar(this.actor(req), id, cuerpo ?? {});
  }

  @Post(':id/invitaciones/:invitacionId/revocar')
  @HttpCode(200)
  revocar(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('invitacionId') invitacionId: string,
  ) {
    return this.invitaciones.revocar(this.actor(req), id, invitacionId);
  }

  @Post(':id/actores/:actorId/desactivar')
  @HttpCode(200)
  desactivar(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('actorId') actorId: string,
    @Body() cuerpo: { motivo?: unknown },
  ) {
    return this.invitaciones.cambiarActivo(
      this.actor(req),
      id,
      actorId,
      false,
      cuerpo?.motivo,
    );
  }

  @Post(':id/actores/:actorId/reactivar')
  @HttpCode(200)
  reactivar(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('actorId') actorId: string,
    @Body() cuerpo: { motivo?: unknown },
  ) {
    return this.invitaciones.cambiarActivo(
      this.actor(req),
      id,
      actorId,
      true,
      cuerpo?.motivo,
    );
  }

  /**
   * Quien pide. `null` es 401 y nunca "un permiso menor": sin identidad no hay
   * decision de autorizacion posible, y el lado seguro del degradado es pedir
   * credenciales. El guard global ya deberia haber cortado antes de llegar.
   */
  private actor(req: Request): ActorSesion {
    const actor = this.identidad.actorDe(req as Request & PeticionConIdentidad);
    if (!actor) throw new UnauthorizedException('Sesion requerida');
    return actor;
  }
}
