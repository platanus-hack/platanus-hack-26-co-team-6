/**
 * El lado del invitado.
 *
 *   GET  /invitacion/:token   — ¿que es esto y sigue sirviendo?
 *   POST /invitacion/:token   — aceptar. Un solo uso.
 *
 * ── POR QUE SON PUBLICAS ───────────────────────────────────────────
 * `publico.decorator.ts` pide justificar cada apertura, y esta es la unica que
 * no tiene alternativa: quien recibe la invitacion NO tiene sesion todavia —
 * conseguirla es exactamente lo que viene a hacer. Exigir cookie aqui seria
 * pedirle la cuenta que la invitacion existe para crearle.
 *
 * ── QUE EXPONE A INTERNET, EXACTAMENTE ─────────────────────────────
 * Nada sin el token. Sin los 32 bytes correctos la respuesta es 404 para todo
 * el mundo: no hay listado, no hay busqueda por correo, no hay forma de
 * enumerar. Con el token correcto se expone el correo al que se mando la
 * invitacion, el rol y el id de la organizacion — que es justo lo que el
 * invitado tiene que poder verificar antes de aceptar algo. Ningun dato
 * clinico entra en este archivo.
 *
 * ── EL TOKEN Y LOS LOGS ────────────────────────────────────────────
 * El token va en la ruta porque un enlace de correo es una URL y no hay otro
 * sitio donde ponerlo. Lo que si esta en nuestra mano: **no escribirlo nunca
 * en un log**. Ningun `Logger` de este modulo recibe el token, el enlace ni la
 * ruta completa; los mensajes nombran la invitacion por su id. Cuando llegue
 * la redaccion de Pino (tarea 5.3), `/invitacion/*` tiene que entrar en la
 * lista de rutas redactadas.
 *
 * `Cache-Control: no-store` en las dos: un enlace de un solo uso no puede
 * quedarse en la cache de un proxy corporativo de hospital.
 */

import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import { Publico } from '../auth/publico.decorator';
import { InvitacionesService } from './invitaciones.service';
import { MensajeHttpFilter } from './mensaje-http.filter';

@UseFilters(MensajeHttpFilter)
@Controller('invitacion')
export class InvitacionController {
  constructor(private readonly invitaciones: InvitacionesService) {}

  @Publico()
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  describir(@Param('token') token: string) {
    return this.invitaciones.describir(token);
  }

  @Publico()
  @Post(':token')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  aceptar(@Param('token') token: string, @Body() cuerpo: { nombre?: unknown }) {
    // Solo `nombre`. No hay campo de contraseña a proposito: las credenciales
    // son de la tarea 1.3 (Argon2id, §3.6) y aceptar una aqui para guardarla
    // con el `sha256` sin sal que hoy existe seria seguridad de mentira.
    return this.invitaciones.aceptar(token, cuerpo ?? {});
  }
}
