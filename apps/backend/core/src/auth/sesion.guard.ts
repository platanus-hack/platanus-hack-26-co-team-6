/**
 * Guard global. Niega por defecto.
 *
 * Se registra como APP_GUARD en AuthModule, así que cubre TODA ruta nueva sin
 * que nadie se acuerde de decorarla. Para abrir una hay que marcarla con
 * @Publico() a propósito — ver publico.decorator.ts.
 *
 * Acepta la sesión por cookie (el navegador) o por `Authorization: Bearer`
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
import { CLAVE_PUBLICO } from './publico.decorator';
import { SesionService, tokenDeCabeceras } from './sesion.service';

@Injectable()
export class SesionGuard implements CanActivate {
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

    const req = contexto.switchToHttp().getRequest<Request>();
    const carga = this.sesion.verificar(tokenDeCabeceras(req.headers));
    if (!carga) {
      throw new UnauthorizedException('Sesión requerida');
    }

    // Disponible para quien lo necesite (atribuir una decisión, por ejemplo).
    (req as Request & { operador?: string }).operador = carga.sub;
    return true;
  }
}
