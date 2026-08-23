/**
 * `@Rol()`, `@AlcanceSede()` y `@Actor()` — tarea 1.3, paso 5.
 *
 * Los tres son la mitad declarativa de la autorizacion; la otra mitad la
 * ejecuta `RolGuard`. Se separan a proposito: leer una ruta y ver quien puede
 * entrar es la mitad del valor de esto.
 *
 *     @Rol('jefe_urgencias', 'regulador_crue')
 *     @AlcanceSede('sedeCodigo')
 *     @Post('handshake/respond')
 *     responder(@Actor() actor: ActorSesion, @Body() cuerpo: RespondRequest)
 *
 * ⚠️ TODAVIA NO SE APLICAN A NINGUNA RUTA EXISTENTE, y es deliberado: esta
 *    tarea entrega la maquinaria, y quien conoce cada ruta la decora en su
 *    propia tarea. Ponerlas hoy sobre rutas que hasta ayer abria una
 *    contraseña compartida romperia el demo sin que nadie lo pida.
 */

import { SetMetadata, createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ActorSesion } from './carga';
import type { Alcance as NombreDeAlcance } from './llaves';
import type { Rol as NombreDeRol } from './roles';

export const CLAVE_ROLES = 'pulso:roles';
export const CLAVE_ALCANCE_SEDE = 'pulso:alcance-sede';
export const CLAVE_ALCANCE_LLAVE = 'pulso:alcance-llave';

/**
 * Roles que pueden entrar. Basta con UNO (es un `or`, no un `and`).
 *
 * Sin este decorador la ruta sigue exigiendo sesion —el `SesionGuard` global
 * niega por defecto— pero no mira roles.
 */
export const Rol = (...roles: NombreDeRol[]) => SetMetadata(CLAVE_ROLES, roles);

/**
 * Alcance que una LLAVE DE API necesita para esta ruta — tarea 5.9.
 *
 * Solo aplica a actores de tipo `servicio`: una persona pasa por `@Rol()`.
 * Una ruta sin este decorador NO la puede usar una llave, y ese silencio es
 * deliberado — el minimo por defecto vale tambien para las rutas.
 */
export const Alcance = (...alcances: NombreDeAlcance[]) =>
  SetMetadata(CLAVE_ALCANCE_LLAVE, alcances);

/**
 * La sede sobre la que actua la peticion tiene que estar en el alcance del
 * actor. `campo` es de donde se lee el codigo: body, params o query, en ese
 * orden.
 *
 * Es el invariante 1 de §5.3, y el mas importante de los cuatro: sin esto,
 * un `jefe_urgencias` de una clinica puede aceptar por el hospital de al lado.
 */
export const AlcanceSede = (campo = 'sedeCodigo') =>
  SetMetadata(CLAVE_ALCANCE_SEDE, campo);

/** El actor de la peticion, ya resuelto por el `SesionGuard`. */
export const Actor = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): ActorSesion | undefined =>
    contexto.switchToHttp().getRequest<Request & { actor?: ActorSesion }>()
      .actor,
);
