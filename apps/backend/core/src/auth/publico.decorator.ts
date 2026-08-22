/**
 * Marca una ruta como accesible sin sesión.
 *
 * REGLA: el guard es GLOBAL y niega por defecto. Este decorador es la única
 * forma de abrir una ruta, y cada uso tiene que justificarse en un comentario.
 * Hoy son exactamente dos:
 *
 *   - GET  /health           → sonda de liveness. No devuelve dato alguno.
 *   - POST /telegram/webhook → lo llama Telegram, no un humano con sesión.
 *                              Se autentica con su propio secreto compartido
 *                              (X-Telegram-Bot-Api-Secret-Token), no con cookie.
 *
 * Si vas a añadir un tercero, pregúntate qué dato expone a internet.
 */

import { SetMetadata } from '@nestjs/common';

export const CLAVE_PUBLICO = 'pulso:publico';

export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);
