/**
 * RolGuard — tarea 1.3, paso 5.
 *
 * Corre DESPUES del `SesionGuard` global, que ya dejo el actor colgado del
 * request. Aqui solo se decide si ese actor puede hacer ESTO sobre ESTA sede.
 *
 * Dos invariantes de §5.3 viven aqui:
 *
 *   1. `handshake:responder` exige que la sede del handshake este en el
 *      alcance del actor. Si no → **403 mas evento `intento_cruzado`**. Un
 *      403 mudo pierde la señal mas interesante del sistema: alguien
 *      intentando aceptar por un hospital que no es el suyo es exactamente
 *      lo que hay que poder contar despues.
 *
 *   4. Ninguna ruta es publica por omision. Eso ya lo garantiza el guard
 *      global; este no lo afloja.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ActorSesion } from './carga';
import { CLAVE_ALCANCE_SEDE, CLAVE_ROLES } from './rol.decorator';
import { ROLES_DE_RED, type Rol } from './roles';
import { RegistroSesiones } from './sesiones';

@Injectable()
export class RolGuard implements CanActivate {
  private readonly log = new Logger(RolGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly registro: RegistroSesiones,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[]>(CLAVE_ROLES, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    const campoSede = this.reflector.getAllAndOverride<string>(
      CLAVE_ALCANCE_SEDE,
      [contexto.getHandler(), contexto.getClass()],
    );

    // Ruta sin decorar: el guard global ya exigio sesion y aqui no hay nada
    // que decidir.
    if (!roles?.length && !campoSede) return true;

    const req = contexto
      .switchToHttp()
      .getRequest<Request & { actor?: ActorSesion }>();
    const actor = req.actor;

    // Sin actor con una ruta decorada seria un fallo de cableado —
    // `RolGuard` corriendo sin `SesionGuard` delante. Se niega.
    if (!actor) throw new ForbiddenException('Sin actor en la sesion');

    if (roles?.length && !roles.some((r) => actor.roles.includes(r))) {
      throw new ForbiddenException('Tu rol no permite esta accion');
    }

    if (campoSede) {
      const sede = this.sedeDe(req, campoSede);
      if (sede && !this.alcanza(actor, sede)) {
        this.log.warn(
          `intento cruzado: actor ${actor.id} (org ${actor.organizacionId}) ` +
            `sobre la sede ${sede}, fuera de su alcance`,
        );
        this.registro.registrar({
          tipo: 'intento_cruzado',
          actorId: actor.id,
          sesionId: actor.sesionId,
          detalle: `sede ${sede} fuera del alcance del actor`,
          en: new Date().toISOString(),
        });
        throw new ForbiddenException('Esa sede no esta en tu alcance');
      }
    }

    return true;
  }

  /**
   * Alcance vacio NO significa "todo el mundo": significa toda SU
   * organizacion. Solo los roles de red (`regulador_crue`, `auditor`,
   * `admin_plataforma`) ven fuera de ella.
   *
   * ⚠️ Mientras no exista `organizacion_sede` (tarea 1.1), no hay forma de
   *    saber que sedes son de una organizacion. Hasta entonces un alcance
   *    vacio pasa, y queda dicho aqui para que quien conecte 1.1 lo cierre
   *    en vez de descubrirlo.
   */
  private alcanza(actor: ActorSesion, sede: string): boolean {
    if (actor.roles.some((r) => ROLES_DE_RED.includes(r))) return true;
    if (!actor.sedes.length) return true;
    return actor.sedes.includes(sede);
  }

  private sedeDe(req: Request, campo: string): string | undefined {
    const cuerpo = req.body as Record<string, unknown> | undefined;
    const valor =
      cuerpo?.[campo] ??
      (req.params as Record<string, unknown>)?.[campo] ??
      (req.query as Record<string, unknown>)?.[campo];
    return typeof valor === 'string' ? valor : undefined;
  }
}
