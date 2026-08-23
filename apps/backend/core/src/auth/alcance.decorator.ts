/**
 * Declara el alcance que una ruta le exige a un token de SERVICIO.
 *
 *   @Alcance('caso:crear')
 *   @Post()
 *   crear(...) { ... }
 *
 * Gana sobre la tabla de `token-servicio.ts`, y es la forma correcta para
 * rutas con parámetro (`/casos/:id`), donde comparar el texto de la URL sería
 * frágil. No afecta a los tokens humanos: hoy un humano autenticado sigue
 * pasando por donde pasaba: la restricción por rol llega con la tarea 1.3.
 *
 * No decorar una ruta NO la abre: sin decorador y sin fila en la tabla, un
 * token de servicio recibe 403. El olvido cierra, no abre.
 */

import { SetMetadata } from '@nestjs/common';
import type { Alcance as AlcanceRequerido } from './token-servicio';

export const CLAVE_ALCANCE = 'pulso:alcance';

export const Alcance = (alcance: AlcanceRequerido) =>
  SetMetadata(CLAVE_ALCANCE, alcance);
