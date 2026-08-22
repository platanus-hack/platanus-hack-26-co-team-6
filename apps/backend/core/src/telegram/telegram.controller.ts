/**
 * POST /telegram/webhook — CARRIL DE SEBAS
 *
 * Recibe los toques de los inline keyboards de Telegram.
 *
 * ─── CÓMO CONECTARLO (5 minutos) ─────────────────────────────────
 * 1. Exponer core (puerto 3001) por HTTPS: deploy, o `npx localtunnel --port 3001`.
 * 2. Registrar el webhook, una sola vez:
 *
 *    curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<TU-CORE>/telegram/webhook"
 *
 * 3. Verificar:
 *    curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
 *
 * ⚠️ OJO CON LA MUDANZA: la URL cambió. Antes era `<app>/api/telegram/webhook`
 *    en el front; ahora es `<core>/telegram/webhook`. Si el webhook sigue
 *    apuntando al front, los botones no hacen nada y no hay error visible.
 *
 * ⚠️ Telegram exige HTTPS. En localhost puro no funciona: usa deploy o túnel.
 * ─────────────────────────────────────────────────────────────────
 */

import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HandshakeService } from '../handshake/handshake.service';

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
   * Siempre 200. Telegram reintenta agresivamente ante cualquier otro código,
   * y un reintento sobre un handshake ya resuelto ensucia el modelo.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() update: TelegramUpdate): Promise<{ ok: true }> {
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
        motivo: decision === 'rechazado' ? 'Saturación del servicio' : undefined,
      });
      texto =
        decision === 'aceptado'
          ? `✅ Traslado ACEPTADO · respondido en ${resultado.handshake.latenciaS}s`
          : `⛔ Rechazado por saturación · PULSO está re-ruteando`;
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
