/**
 * Un filtro de excepciones acotado a los controladores de este modulo.
 *
 * ── POR QUE HACE FALTA ─────────────────────────────────────────────
 * `PulsoErrorFilter` esta registrado como `APP_FILTER` global y, ante
 * cualquier `HttpException` con estado < 500, responde SIEMPRE lo mismo:
 *
 *     { error: { code: 'PULSO_INVALID_INPUT', message: 'Invalid request' } }
 *
 * Para el ruteo eso esta bien —los errores que importan son los `PulsoError`
 * de dominio, que si conservan su codigo—, pero aqui borra justo lo unico que
 * el usuario necesita leer. La tarea pide "un token de 73 h → 410 **con
 * mensaje claro**", y "Invalid request" no distingue un enlace vencido de uno
 * ya usado ni de un rol que no se puede otorgar. Son tres acciones distintas.
 *
 * ── POR QUE ASI Y NO CAMBIANDO EL GLOBAL ───────────────────────────
 * `common/pulso-error.filter.ts` es transversal y de otro carril: tocarlo
 * cambiaria la forma de los errores de todos los modulos a la vez. Un filtro
 * de controlador tiene precedencia sobre el global y no afecta a nadie mas.
 *
 * ── QUE FORMA DEVUELVE ─────────────────────────────────────────────
 * La de Nest (`{ statusCode, message, error }`), que es una de las dos que
 * `lib/api.ts::pedir()` ya sabe leer: sin codigo de dominio, lee `message`. No
 * se inventa un `PulsoCode` nuevo porque esa union vive en `contracts/types.ts`
 * y ese archivo es del protocolo del ruteo, no de este modulo.
 *
 * Lo que NO es `HttpException` no se toca: sigue cayendo en el filtro global,
 * que lo convierte en un 500 generico. Un error inesperado no debe filtrar su
 * mensaje al cliente.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch(HttpException)
export class MensajeHttpFilter implements ExceptionFilter {
  catch(excepcion: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const estado = excepcion.getStatus();
    const cuerpo = excepcion.getResponse();

    res.status(estado).json(
      typeof cuerpo === 'string'
        ? { statusCode: estado, message: cuerpo }
        : cuerpo,
    );
  }
}
