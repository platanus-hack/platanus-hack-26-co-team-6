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
import type { Alcance } from './llaves';
import {
  CLAVE_ALCANCE_LLAVE,
  CLAVE_ALCANCE_SEDE,
  CLAVE_ROLES,
} from './rol.decorator';
import { ROLES_DE_RED, type Rol } from './roles';
import { RegistroService } from '../eventos/registro.service';
import { RegistroSesiones } from './sesiones';

@Injectable()
export class RolGuard implements CanActivate {
  private readonly log = new Logger(RolGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly registro: RegistroSesiones,
    /**
     * Tarea 3.2: un intento cruzado tambien es un evento DEL CASO, no solo
     * una nota de seguridad. Opcional porque el guard se construye a mano en
     * sus propios tests, y ahi no hay caso al que colgarlo.
     */
    private readonly eventos?: RegistroService,
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
    const alcancesRuta = this.reflector.getAllAndOverride<Alcance[]>(
      CLAVE_ALCANCE_LLAVE,
      [contexto.getHandler(), contexto.getClass()],
    );

    // Ruta sin decorar: para una persona no hay nada que decidir —el guard
    // global ya exigio sesion—, pero **una llave de API se niega igual**. El
    // minimo por defecto vale tambien para las rutas: olvidarse de abrir una
    // se ve enseguida; haberlas dejado todas abiertas, no.
    if (!roles?.length && !campoSede && !alcancesRuta) {
      const actorLibre = contexto
        .switchToHttp()
        .getRequest<Request & { actor?: ActorSesion }>().actor;
      if (actorLibre?.alcances)
        throw new ForbiddenException('Esta ruta no admite llaves de API');
      return true;
    }

    const req = contexto
      .switchToHttp()
      .getRequest<Request & { actor?: ActorSesion }>();
    const actor = req.actor;

    // Sin actor con una ruta decorada seria un fallo de cableado —
    // `RolGuard` corriendo sin `SesionGuard` delante. Se niega.
    if (!actor) throw new ForbiddenException('Sin actor en la sesion');

    // ── Llaves de API (5.9) ──────────────────────────────────────
    //
    // Una llave no tiene roles: tiene una lista corta de cosas que puede
    // hacer. Y **una ruta sin `@Alcance()` no la puede usar ninguna llave**,
    // aunque lleve `@Rol('servicio')`: el minimo por defecto vale tambien
    // para las rutas, porque el error de olvidarse de abrir una se ve
    // enseguida y el de haberlas dejado todas abiertas no.
    if (actor.alcances) {
      if (!alcancesRuta?.length)
        throw new ForbiddenException('Esta ruta no admite llaves de API');
      if (!alcancesRuta.some((a) => actor.alcances!.includes(a)))
        throw new ForbiddenException(
          `La llave no tiene el alcance necesario (${alcancesRuta.join(' o ')})`,
        );
      return true;
    }

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

        // Y si la peticion nombraba un caso, tambien queda en SU linea de
        // tiempo: quien audite ese traslado tiene que ver que alguien de otra
        // sede intento tocarlo. `void` porque canActivate es sincrono y
        // `registrar()` no lanza nunca.
        const casoId = this.casoDe(req);
        if (casoId)
          void this.eventos?.registrar({
            casoId,
            tipo: 'intento_cruzado',
            actorId: actor.id,
            codigoSede: sede,
            detalle: { organizacionActor: actor.organizacionId },
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

  /** El caso que nombra la peticion, si lo nombra. */
  private casoDe(req: Request): string | undefined {
    const cuerpo = req.body as Record<string, unknown> | undefined;
    const valor = cuerpo?.casoId ?? (req.params as Record<string, unknown>)?.id;
    return typeof valor === 'string' ? valor : undefined;
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
