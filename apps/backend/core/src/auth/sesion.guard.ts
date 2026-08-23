/**
 * Guard global. Niega por defecto.
 *
 * Se registra como APP_GUARD en AuthModule, así que cubre TODA ruta nueva sin
 * que nadie se acuerde de decorarla. Para abrir una hay que marcarla con
 * @Publico() a propósito — ver publico.decorator.ts.
 *
 * Acepta la sesión por cookie (el navegador) o por `Authorization: Bearer`
 * (curl, el script doctor, el servicio `voz`). Es el mismo token firmado.
 *
 * DOS PUERTAS, NO UNA:
 *   1. ¿Hay token válido?  → si no, 401.
 *   2. Si el token es de SERVICIO, ¿esta ruta está en su alcance? → si no, 403.
 *
 * La segunda puerta es lo que hace que `voz` pueda crear un caso y NO pueda
 * aceptar un traslado. Para un token humano no cambia nada: pasa como ayer.
 * El día que 1.3 traiga roles reales, la comprobación de rol humano se suma
 * aquí mismo, junto a la de alcance.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CLAVE_ALCANCE } from './alcance.decorator';
import { CLAVE_PUBLICO } from './publico.decorator';
import { SesionService, tokenDeCabeceras, type Carga } from './sesion.service';
import { alcanceDeRuta, type Alcance } from './token-servicio';

/** Lo que el resto de core puede leer del request para atribuir una acción. */
export interface ActorSesion {
  /** 'operador' para un humano, 'svc:voz' para el canal público. */
  sub: string;
  tipo: 'humano' | 'servicio';
  alcance: Alcance[];
}

export type RequestConActor = Request & {
  actor?: ActorSesion;
  operador?: string;
};

@Injectable()
export class SesionGuard implements CanActivate {
  private readonly log = new Logger(SesionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sesion: SesionService,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const publico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico) return true;

    const req = contexto.switchToHttp().getRequest<RequestConActor>();
    const carga = this.sesion.verificar(tokenDeCabeceras(req.headers));
    if (!carga) {
      throw new UnauthorizedException('Sesión requerida');
    }

    const actor = aActor(carga);
    if (actor.tipo === 'servicio') {
      this.exigirAlcance(contexto, req, actor);
    }

    // Disponible para quien lo necesite (atribuir una decisión, por ejemplo).
    // `operador` se conserva porque ya había código mirándolo; `actor` es el
    // que distingue a `svc:voz` de una persona en la auditoría.
    req.actor = actor;
    req.operador = actor.sub;
    return true;
  }

  private exigirAlcance(
    contexto: ExecutionContext,
    req: RequestConActor,
    actor: ActorSesion,
  ): void {
    // El decorador gana sobre la tabla: es explícito y sobrevive a las rutas
    // con parámetro, donde comparar el texto de la URL sería frágil.
    const requerido =
      this.reflector.getAllAndOverride<Alcance>(CLAVE_ALCANCE, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) ?? alcanceDeRuta(req.method, req.path);

    if (requerido && actor.alcance.includes(requerido)) return;

    // Un 403 mudo pierde la señal más interesante del sistema (doc §5.3): que
    // un servicio intentó algo fuera de su alcance. Se registra sin PII —
    // método y ruta, nunca la query ni el cuerpo.
    this.log.warn(
      `Alcance insuficiente: ${actor.sub} → ${req.method} ${req.path} ` +
        `(exige ${requerido ?? 'una declaración de alcance que no existe'}; ` +
        `tiene [${actor.alcance.join(', ')}])`,
    );

    throw new ForbiddenException(
      requerido
        ? `El servicio ${actor.sub} no tiene el alcance "${requerido}"`
        : `La ruta ${req.method} ${req.path} no está abierta a tokens de servicio`,
    );
  }
}

/**
 * Un token sin `tip` es de antes de la tarea 1.8 y se trata como humano: si se
 * asumiera servicio, un despliegue dejaría sin alcance a las consolas abiertas.
 */
function aActor(carga: Carga): ActorSesion {
  return carga.tip === 'servicio'
    ? { sub: carga.sub, tipo: 'servicio', alcance: carga.alc ?? [] }
    : { sub: carga.sub, tipo: 'humano', alcance: [] };
}
