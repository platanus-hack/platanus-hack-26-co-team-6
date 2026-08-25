/**
 * Rutas de equipo e invitaciones — tarea 2.5.
 *
 *   POST   /organizaciones/:id/invitaciones        admin_organizacion
 *   GET    /organizaciones/:id/equipo              admin_organizacion
 *   DELETE /organizaciones/:id/invitaciones/:inv   admin_organizacion (revocar)
 *   DELETE /organizaciones/:id/actores/:actor      admin_organizacion (desactivar)
 *   POST   /invitaciones/:token/aceptar            PUBLICO, un solo uso
 *
 * ⚠️ EL TOKEN VIAJA EN LA URL Y ESO ES A PROPOSITO, PERO NO ES GRATIS.
 *
 *    La regla 5 del repo dice «sin PII en logs ni en URLs». Un token de
 *    invitacion no es PII, pero si es una credencial, y una credencial en la
 *    URL queda en el historial del navegador, en el `Referer` de la
 *    siguiente peticion y en cualquier proxy que registre rutas.
 *
 *    Va en la URL igual porque tiene que poder pegarse en un WhatsApp — es
 *    todo el punto de una invitacion por enlace. Lo que se hace en cambio:
 *      · dura 72 h y un solo uso, asi que la ventana es corta
 *      · el front lo saca de la URL y lo manda en el cuerpo del POST
 *      · en base solo vive su hash
 *      · la redaccion de Pino (5.3) tiene que tapar `/invitacion/*`
 *    Ese ultimo punto es de otra tarea y esta escrito aqui para que quien la
 *    haga lo encuentre.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AceptarInvitacionRequest,
  AceptarInvitacionResponse,
  Actor,
  CrearInvitacionRequest,
  CrearInvitacionResponse,
  EquipoResponse,
  Invitacion,
} from '../contracts/types';
import { PulsoError } from '../common/pulso-error.filter';
import { Actor as ActorDeSesion, Rol } from '../auth/rol.decorator';
import type { ActorSesion } from '../auth/carga';
import { Publico } from '../auth/publico.decorator';
import { InvitacionesService } from './invitaciones.service';

@Controller()
export class InvitacionesController {
  constructor(
    private readonly invitaciones: InvitacionesService,
    private readonly config: ConfigService,
  ) {}

  @Rol('admin_organizacion', 'admin_plataforma')
  @Post('organizaciones/:id/invitaciones')
  @HttpCode(201)
  async invitar(
    @Param('id') organizacionId: string,
    @Body() cuerpo: CrearInvitacionRequest,
    @ActorDeSesion() actor: ActorSesion | undefined,
  ): Promise<CrearInvitacionResponse> {
    return this.invitaciones.invitar(
      organizacionId,
      cuerpo,
      exigirActor(actor),
      this.baseFront(),
    );
  }

  @Rol('admin_organizacion', 'admin_plataforma')
  @Get('organizaciones/:id/equipo')
  async equipo(
    @Param('id') organizacionId: string,
    @ActorDeSesion() actor: ActorSesion | undefined,
  ): Promise<EquipoResponse> {
    return this.invitaciones.equipo(organizacionId, exigirActor(actor));
  }

  /**
   * `DELETE` de una invitacion es revocarla, y esa es la unica cosa del
   * sistema que un DELETE puede significar: la invitacion no es un hecho
   * clinico ni una decision, es una llave que todavia no se uso.
   */
  @Rol('admin_organizacion', 'admin_plataforma')
  @Delete('organizaciones/:id/invitaciones/:invitacionId')
  async revocar(
    @Param('id') organizacionId: string,
    @Param('invitacionId') invitacionId: string,
    @ActorDeSesion() actor: ActorSesion | undefined,
  ): Promise<{ invitacion: Invitacion }> {
    return {
      invitacion: await this.invitaciones.revocar(
        organizacionId,
        invitacionId,
        exigirActor(actor),
      ),
    };
  }

  /**
   * `DELETE` de un actor NO borra: pone `activo = false`. El verbo es DELETE
   * porque es lo que el boton dice, pero la fila se queda — sin ella, media
   * auditoria apunta a un uuid que ya no resuelve.
   */
  @Rol('admin_organizacion', 'admin_plataforma')
  @Delete('organizaciones/:id/actores/:actorId')
  async desactivar(
    @Param('id') organizacionId: string,
    @Param('actorId') actorId: string,
    @ActorDeSesion() actor: ActorSesion | undefined,
  ): Promise<{ actor: Actor }> {
    return {
      actor: await this.invitaciones.desactivar(
        organizacionId,
        actorId,
        exigirActor(actor),
      ),
    };
  }

  /**
   * Publico porque quien acepta TODAVIA NO TIENE CUENTA: la esta creando.
   * El token es la autenticacion, y es de un solo uso.
   */
  @Publico()
  @Post('invitaciones/:token/aceptar')
  @HttpCode(201)
  async aceptar(
    @Param('token') token: string,
    @Body() cuerpo: AceptarInvitacionRequest,
  ): Promise<AceptarInvitacionResponse> {
    return this.invitaciones.aceptar(token, cuerpo);
  }

  /** A donde apunta el enlace. El mismo origen que ya usa CORS. */
  private baseFront(): string {
    return (
      this.config.get<string>('FRONTEND_BASE_URL') ??
      this.config.get<string>('CORS_ORIGIN') ??
      'http://localhost:3000'
    );
  }
}

/**
 * El `@Actor()` de 1.3 devuelve `undefined` si el guard no corrio.
 *
 * Que eso pase seria un fallo de cableado —`RolGuard` sin `SesionGuard`
 * delante—, no una peticion sin sesion. Se niega en vez de seguir con un
 * actor inventado, que es como se cuelan las escaladas.
 */
function exigirActor(actor: ActorSesion | undefined): ActorSesion {
  if (!actor) {
    throw new PulsoError(
      'PULSO_INVALID_INPUT',
      'Sin actor en la sesion.',
      undefined,
      false,
      401,
    );
  }
  return actor;
}
