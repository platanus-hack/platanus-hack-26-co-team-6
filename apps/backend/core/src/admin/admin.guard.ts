/**
 * El guard de `/admin`. Traduce la peticion HTTP a hechos y le pregunta a
 * `decidirAcceso()`. **Aqui no se decide nada**: si esta logica se duplicara,
 * el dia que 1.3 cambie la regla habria dos sitios donde cambiarla y uno se
 * quedaria atras.
 *
 * Corre DESPUES del `SesionGuard` global (Nest ejecuta los guards globales
 * antes que los de controlador), asi que llegar aqui ya implica sesion valida.
 * Se vuelve a verificar el token igualmente: este guard tiene que poder
 * responder "quien eres" y no solo "puedes pasar", y depender de que otro
 * guard haya dejado algo en `req` es la clase de acoplamiento que se rompe en
 * silencio cuando alguien reordena los providers.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SesionService, tokenDeCabeceras } from '../auth/sesion.service';
import { decidirAcceso, type Acceso, type CargaSesion } from './acceso-admin';

/** Cabecera del puente provisional. Ver acceso-admin.ts. */
export const CABECERA_ADMIN = 'x-pulso-admin';

/** Lo que el guard deja en la peticion para que el controlador firme el evento. */
export interface PeticionAdmin extends Request {
  accesoAdmin?: Extract<Acceso, { permitido: true }>;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly sesion: SesionService) {}

  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto.switchToHttp().getRequest<PeticionAdmin>();
    const acceso = evaluar(this.sesion, req);

    if (!acceso.permitido) {
      // 401 solo cuando falta la sesion; todo lo demas es 403. Un 401 en un
      // caso de "tienes sesion pero no te toca" haria que el cliente intentara
      // renovar el token una y otra vez contra una puerta que nunca abre.
      if (acceso.motivo === 'sin-sesion') throw new UnauthorizedException(acceso.mensaje);
      throw new ForbiddenException(acceso.mensaje);
    }

    req.accesoAdmin = acceso;
    return true;
  }
}

/**
 * Evalua el acceso sin lanzar. Lo usa tambien `GET /admin/acceso`, que tiene
 * que poder CONTAR la negacion en vez de convertirla en un 403 mudo: una
 * consola que solo ve "403" no puede explicarle a nadie que lo que falta es
 * una variable de entorno en core.
 */
export function evaluar(sesion: SesionService, req: Request): Acceso {
  const carga = sesion.verificar(tokenDeCabeceras(req.headers)) as CargaSesion | null;
  const cabecera = req.headers[CABECERA_ADMIN];
  const token = Array.isArray(cabecera) ? cabecera[0] : cabecera;

  return decidirAcceso({
    carga,
    plataformaConfigurada: sesion.emisionDeServicioHabilitada(),
    tokenPlataformaPresente: typeof token === 'string' && token.length > 0,
    tokenPlataformaValido: sesion.verificarAdminPlataforma(token),
  });
}
