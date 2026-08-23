/**
 * Guard global. Niega por defecto.
 *
 * Se registra como APP_GUARD en AuthModule, asi que cubre TODA ruta nueva sin
 * que nadie se acuerde de decorarla. Para abrir una hay que marcarla con
 * @Publico() a proposito — ver publico.decorator.ts. Ese diseño es correcto y
 * la tarea 1.3 lo conserva tal cual.
 *
 * Lo que cambia en 1.3: ya no cuelga un string `operador` del request, cuelga
 * el ACTOR — quien es, de que organizacion, con que roles y sobre que sedes.
 * De ahi vive todo lo demas: `RolGuard`, `@Actor()`, y la respuesta a "quien
 * acepto a este paciente".
 *
 * Acepta la sesion por cookie (el navegador) o por `Authorization: Bearer`
 * (curl, el script doctor, un futuro servicio). Es el mismo token firmado.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ActorSesion } from './carga';
import { CLAVE_PUBLICO } from './publico.decorator';
import { LlavesService, PREFIJO } from './llaves';
import { SesionService, tokenDeCabeceras } from './sesion.service';

@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sesion: SesionService,
    private readonly llaves: LlavesService,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const publico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico) return true;

    const req = contexto.switchToHttp().getRequest<Request>();
    const presentado = tokenDeCabeceras(req.headers);

    // ── Llave de API (5.9) ───────────────────────────────────────
    //
    // `Authorization: Bearer pulso_sk_…` es una integracion, no una persona.
    // Se resuelve aqui y no en un guard aparte para que la puerta siga
    // siendo UNA: dos sitios donde se decide quien entra es el patron con el
    // que se cuelan las cosas.
    if (presentado?.startsWith(PREFIJO)) {
      const verificacion = this.llaves.verificar(presentado, ipDe(req));
      if (!verificacion.valida)
        throw new UnauthorizedException('Llave de API invalida');

      const llave = verificacion.llave;
      const actorLlave: ActorSesion = {
        // `llave:` delante, igual que `legado:`: en la auditoria de dentro de
        // tres meses tiene que verse a simple vista que esto no es una
        // persona. Ademas le da a cada llave su propio cubo de limite de
        // tasa, independiente del de las sesiones (tarea 2.11).
        id: `llave:${llave.id}`,
        organizacionId: llave.organizacionId,
        roles: ['servicio'],
        sedes: [],
        tipo: 'servicio',
        sesionId: `llave:${llave.id}`,
        legado: false,
        alcances: llave.alcances,
        llaveId: llave.id,
      };
      (req as Request & { actor?: ActorSesion }).actor = actorLlave;
      (req as Request & { operador?: string }).operador = actorLlave.id;
      return true;
    }

    const carga = this.sesion.verificarAcceso(presentado);
    if (!carga) {
      // Mismo 401 para token invalido, expirado y sesion revocada. Distinguir
      // los tres le diria a quien prueba en cual de las tres esta.
      throw new UnauthorizedException('Sesion requerida');
    }

    const actor = this.sesion.actorDeCarga(carga);
    (req as Request & { actor?: ActorSesion }).actor = actor;
    // Compatibilidad: habia codigo leyendo `req.operador`. Se conserva el
    // campo con el id del actor para no romperlo mientras se migra.
    (req as Request & { operador?: string }).operador = actor.id;
    return true;
  }
}

/** La IP real detras del proxy de Render, o la del socket en local. */
function ipDe(req: Request): string | undefined {
  const reenviada = req.headers['x-forwarded-for'];
  const primera = Array.isArray(reenviada) ? reenviada[0] : reenviada;
  return (primera?.split(',')[0] ?? req.ip)?.trim();
}
