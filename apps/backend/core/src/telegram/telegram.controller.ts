/**
 * POST /telegram/webhook — CARRIL DE SEBAS
 *
 * Recibe los toques de los inline keyboards de Telegram.
 *
 * ─── CÓMO CONECTARLO (5 minutos) ─────────────────────────────────
 * 1. Exponer core (puerto 3001) por HTTPS: deploy, o `npx localtunnel --port 3001`.
 *
 * 2. Inventar un secreto y ponerlo en `apps/backend/core/.env`:
 *
 *    TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
 *
 * 3. Registrar el webhook CON ese secreto, una sola vez:
 *
 *    curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<TU-CORE>/telegram/webhook&secret_token=<EL-SECRETO>"
 *
 * 4. Verificar:
 *    curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
 *
 * ⚠️ EL PASO 2 NO ES OPCIONAL. Esta ruta es pública (Telegram no tiene cookie
 *    de sesión) y decide traslados de pacientes. Sin el secreto, cualquiera
 *    que adivine la URL puede fabricar un "el hospital aceptó" que el sistema
 *    no distingue de un toque real del jefe de urgencias. Si el secreto falta,
 *    el webhook rechaza todo — a propósito.
 *
 * ⚠️ OJO CON LA MUDANZA: la URL cambió. Antes era `<app>/api/telegram/webhook`
 *    en el front; ahora es `<core>/telegram/webhook`. Si el webhook sigue
 *    apuntando al front, los botones no hacen nada y no hay error visible.
 *
 * ⚠️ Telegram exige HTTPS. En localhost puro no funciona: usa deploy o túnel.
 * ─────────────────────────────────────────────────────────────────
 */

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { MOTIVO_POR_DEFECTO } from '../catalogo/motivos-rechazo';
import { HandshakeService } from '../handshake/handshake.service';
import { Publico } from '../auth/publico.decorator';

interface TelegramUpdate {
  message?: { chat?: { id?: number } };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

@Controller('telegram')
export class TelegramController {
  private readonly log = new Logger(TelegramController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly handshake: HandshakeService,
  ) {}

  private token(): string | undefined {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN');
  }

  /**
   * Falla cerrado: sin TELEGRAM_WEBHOOK_SECRET configurado no se procesa nada.
   *
   * Es la única excepción a la regla del repo de "sin credenciales, cae a mock
   * y sigue": aquí el mock permisivo sería precisamente el agujero. Si no está
   * configurado, usa la consola /hospital, que sí exige sesión.
   */
  private secretoValido(recibido?: string): boolean {
    const esperado = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (!esperado) {
      this.log.error(
        'TELEGRAM_WEBHOOK_SECRET sin configurar — el webhook queda cerrado. ' +
          'Ver las instrucciones al inicio de este archivo.',
      );
      return false;
    }
    if (!recibido) return false;

    const a = Buffer.from(recibido, 'utf8');
    const b = Buffer.from(esperado, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Siempre 200. Telegram reintenta agresivamente ante cualquier otro código,
   * y un reintento sobre un handshake ya resuelto ensucia el modelo.
   */
  @Publico()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secreto?: string,
  ): Promise<{ ok: true }> {
    // Telegram manda este header en cada entrega si registraste el webhook con
    // secret_token. Es lo único que separa una pulsación real del jefe de
    // urgencias de un curl de un desconocido: se valida ANTES de mirar el body.
    if (!this.secretoValido(secreto)) {
      this.log.warn('webhook rechazado: secret_token ausente o incorrecto');
      // 200 igual: un 401 haría a Telegram reintentar en bucle, y no queremos
      // confirmarle a quien sondea que acertó la ruta.
      return { ok: true };
    }

    const cb = update?.callback_query;

    if (!cb?.data) {
      // Mensaje normal, no un botón. Respondemos el chat_id para poder
      // copiarlo a TELEGRAM_CHAT_ID_DEMO sin pelear con getUpdates.
      const chatId = update?.message?.chat?.id;
      if (chatId && this.token()) {
        await this.enviarTexto(
          chatId,
          `PULSO conectado ✅\nTu chat_id es: ${chatId}\n\nPéguelo en TELEGRAM_CHAT_ID_DEMO.`,
        );
      }
      return { ok: true };
    }

    // callback_data viene como "a:<uuid>" o "r:<uuid>"
    const [prefijo, handshakeId] = String(cb.data).split(':');
    const decision = prefijo === 'a' ? 'aceptado' : 'rechazado';

    let texto: string;
    try {
      const resultado = await this.handshake.procesarRespuesta({
        handshakeId,
        decision,
        // Telegram no ofrece la lista de motivos (son dos botones), así que
        // manda el código genérico del catálogo — tarea 0.6. Lo que NO se
        // hace es mandar texto libre: eso es lo que partía la serie.
        motivoCodigo:
          decision === 'rechazado' ? MOTIVO_POR_DEFECTO : undefined,
      });

      if (!resultado.aplicada) {
        // La respuesta no cambió nada. Decirlo importa — si aquí saliera
        // "ACEPTADO", este jefe de urgencias prepararía una cama para un
        // paciente que va camino a otro hospital.
        //
        // Los tres motivos son distintos y hay que distinguirlos. El tercero
        // NO se veía en `handshake.estado` (sigue en 'enviado') y salía como
        // "esta solicitud ya estaba enviado", que no le dice nada a nadie.
        texto =
          resultado.codigo === 'PULSO_DESTINATION_ALREADY_ACCEPTED'
            ? '🏥 Otra sede ya aceptó este caso · no prepare cama'
            : resultado.handshake.estado === 'timeout'
              ? '⏱ Esta solicitud ya venció · PULSO la envió a otra sede'
              : `Esta solicitud ya estaba ${resultado.handshake.estado}`;
      } else {
        texto =
          decision === 'aceptado'
            ? `✅ Traslado ACEPTADO · respondido en ${resultado.handshake.latenciaS}s`
            : `⛔ Rechazado por saturación · PULSO está re-ruteando`;
      }
    } catch (e) {
      this.log.warn(`callback sin handshake válido: ${String(e)}`);
      texto = 'No se encontró la solicitud';
    }

    if (this.token() && cb.message) {
      // Quita el teclado para que no se pueda tocar dos veces.
      await this.llamar('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: texto,
      });
      await this.llamar('editMessageReplyMarkup', {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        reply_markup: {
          inline_keyboard: [[{ text: texto, callback_data: 'noop' }]],
        },
      });
    }

    return { ok: true };
  }

  private async enviarTexto(chatId: number, texto: string): Promise<void> {
    await this.llamar('sendMessage', { chat_id: chatId, text: texto });
  }

  private async llamar(metodo: string, cuerpo: unknown): Promise<void> {
    const token = this.token();
    if (!token) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
    } catch (e) {
      this.log.warn(`Telegram ${metodo} falló: ${String(e)}`);
    }
  }
}
