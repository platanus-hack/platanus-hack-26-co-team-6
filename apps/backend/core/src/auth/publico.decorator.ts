/**
 * Marca una ruta como accesible sin sesión.
 *
 * REGLA: el guard es GLOBAL y niega por defecto. Este decorador es la única
 * forma de abrir una ruta, y cada uso tiene que justificarse en un comentario.
 * Hoy son exactamente tres (más los tres de /auth, que son la puerta misma):
 *
 *   - GET  /health           → sonda de liveness. No devuelve dato alguno.
 *   - POST /telegram/webhook → lo llama Telegram, no un humano con sesión.
 *                              Se autentica con su propio secreto compartido
 *                              (X-Telegram-Bot-Api-Secret-Token), no con cookie.
 *   - POST /auth/servicio    → emite el token de `voz`. NO está abierto: lo
 *                              protege PULSO_ADMIN_TOKEN en su propia cabecera,
 *                              y sin esa variable la ruta niega a todo el
 *                              mundo. Está marcado @Publico() porque quien lo
 *                              llama es plataforma, no un operador con cookie.
 *                              Con la tarea 1.3 pasa a @Rol('admin_plataforma').
 *
 * Si vas a añadir un cuarto, pregúntate qué dato expone a internet.
 */

import { SetMetadata } from '@nestjs/common';

export const CLAVE_PUBLICO = 'pulso:publico';

export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);
