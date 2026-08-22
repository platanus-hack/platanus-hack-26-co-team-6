/**
 * Canales del handshake de un toque.
 *
 * ESTRATEGIA (leer antes de tocar):
 *  - TELEGRAM es el canal PRIMARIO del demo. Inline keyboards, cero
 *    aprobación, funciona en 15 minutos. Es la red de seguridad.
 *  - WHATSAPP es la VITRINA. Impresiona más, pero mandar un mensaje iniciado
 *    por el negocio exige una plantilla aprobada por Meta que tarda 24-48h.
 *    Truco del demo: que el "jefe de urgencias" le escriba primero al número
 *    → se abre la ventana de 24h → los botones interactivos fluyen sin
 *    plantilla.
 *  - CONSOLA es el fallback absoluto: la pantalla web del hospital. Si se cae
 *    el wifi de los celulares, el demo sigue.
 *
 * Sin tokens configurados, todo esto loguea y devuelve enviado: true. El flujo
 * nunca se rompe por falta de credenciales.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Caso, Handshake, Sede } from '../contracts/types';
import {
  ETIQUETA_TRIAGE,
  esHoraDorada,
  nombresServicios,
} from '../catalogo/servicios-reps';

export interface ResultadoEnvio {
  enviado: boolean;
  canal: string;
  detalle?: string;
}

@Injectable()
export class CanalesService {
  private readonly log = new Logger(CanalesService.name);

  constructor(private readonly config: ConfigService) {}

  /** URL pública del front, para armar los enlaces de los botones. */
  private baseUrl(): string {
    return (
      this.config.get<string>('PUBLIC_APP_URL') ??
      this.config.get<string>('CORS_ORIGIN') ??
      'http://localhost:3000'
    );
  }

  /**
   * El texto de la tarjeta que ve el jefe de urgencias.
   * Tiene que ser legible de un vistazo, en un celular, a las 3 de la mañana.
   * Nada de párrafos.
   */
  textoTarjeta(caso: Caso, sede: Sede, etaMin?: number): string {
    const bandera = esHoraDorada(caso.triage) ? '🔴' : '🟡';
    const sexo =
      caso.sexo === 'M'
        ? 'masculino'
        : caso.sexo === 'F'
          ? 'femenino'
          : 'sexo no referido';
    const lineas = [
      `${bandera} *SOLICITUD DE TRASLADO — PULSO*`,
      ``,
      `*${sede.nombre}*`,
      `Triage ${ETIQUETA_TRIAGE[caso.triage]}`,
      ``,
      `${caso.resumen}`,
      ``,
      `• Paciente: ${caso.edad ?? '?'} años, ${sexo}`,
      caso.dxCie10
        ? `• Dx probable: ${caso.dxDescripcion} (${caso.dxCie10})`
        : `• Dx probable: ${caso.dxDescripcion}`,
      `• Requiere: ${nombresServicios(caso.serviciosRequeridos)}`,
      `• Móvil: ${caso.tipoMovil}`,
      etaMin != null ? `• ETA: ${Math.round(etaMin)} min` : null,
      caso.signosAlarma.length ? `• Alarma: ${caso.signosAlarma.join(', ')}` : null,
    ].filter(Boolean);
    return lineas.join('\n');
  }

  // ── Telegram — canal primario ──────────────────────────────────

  async enviarTelegram(
    handshake: Handshake,
    caso: Caso,
    sede: Sede,
    etaMin?: number,
  ): Promise<ResultadoEnvio> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    const chat = this.config.get<string>('TELEGRAM_CHAT_ID_DEMO');

    if (!token || !chat) {
      this.log.log(
        `\n──────── [PULSO · Telegram no configurado] ────────\n` +
          `${this.textoTarjeta(caso, sede, etaMin)}\n` +
          `Responder en: ${this.baseUrl()}/hospital\n` +
          `───────────────────────────────────────────────────`,
      );
      return {
        enviado: true,
        canal: 'telegram(mock)',
        detalle: 'sin token, logueado a consola',
      };
    }

    // callback_data tiene tope de 64 bytes. "a:<uuid>" cabe de sobra.
    const teclado = {
      inline_keyboard: [
        [
          { text: '✅ Aceptar traslado', callback_data: `a:${handshake.id}` },
          {
            text: '⛔ Rechazar por saturación',
            callback_data: `r:${handshake.id}`,
          },
        ],
      ],
    };

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chat,
            text: this.textoTarjeta(caso, sede, etaMin),
            parse_mode: 'Markdown',
            reply_markup: teclado,
          }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; description?: string };
      if (!json.ok) {
        return { enviado: false, canal: 'telegram', detalle: json.description };
      }
      return { enviado: true, canal: 'telegram' };
    } catch (e) {
      return { enviado: false, canal: 'telegram', detalle: String(e) };
    }
  }

  // ── WhatsApp Cloud API — la vitrina ────────────────────────────

  /**
   * Mensaje interactivo con botones de respuesta.
   * ⚠️ Solo funciona DENTRO de la ventana de 24h (el destinatario escribió
   *    primero). Fuera de la ventana hace falta plantilla aprobada. Antes del
   *    demo: que el celular receptor le escriba "hola" al número.
   */
  async enviarWhatsApp(
    handshake: Handshake,
    caso: Caso,
    sede: Sede,
    etaMin?: number,
  ): Promise<ResultadoEnvio> {
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const to = this.config.get<string>('WHATSAPP_TO_DEMO');

    if (!token || !phoneId || !to) {
      return { enviado: false, canal: 'whatsapp', detalle: 'sin credenciales' };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'interactive',
            interactive: {
              type: 'button',
              body: { text: this.textoTarjeta(caso, sede, etaMin) },
              action: {
                buttons: [
                  {
                    type: 'reply',
                    reply: { id: `a:${handshake.id}`, title: 'Aceptar' },
                  },
                  {
                    type: 'reply',
                    reply: { id: `r:${handshake.id}`, title: 'Rechazar' },
                  },
                ],
              },
            },
          }),
        },
      );
      const json = (await res.json()) as { error?: { message: string } };
      if (json.error) {
        return { enviado: false, canal: 'whatsapp', detalle: json.error.message };
      }
      return { enviado: true, canal: 'whatsapp' };
    } catch (e) {
      return { enviado: false, canal: 'whatsapp', detalle: String(e) };
    }
  }

  // ── Despachador ────────────────────────────────────────────────

  /**
   * Intenta el canal pedido; si falla, cae al siguiente. La consola web
   * siempre funciona, así que nunca devolvemos "no se pudo notificar".
   */
  async notificar(
    handshake: Handshake,
    caso: Caso,
    sede: Sede,
    etaMin?: number,
  ): Promise<ResultadoEnvio> {
    if (handshake.canal === 'whatsapp') {
      const wa = await this.enviarWhatsApp(handshake, caso, sede, etaMin);
      if (wa.enviado) return wa;
      this.log.warn(`WhatsApp falló, cayendo a Telegram: ${wa.detalle}`);
    }
    if (handshake.canal !== 'consola') {
      const tg = await this.enviarTelegram(handshake, caso, sede, etaMin);
      if (tg.enviado) return tg;
    }
    return { enviado: true, canal: 'consola', detalle: 'visible en /hospital' };
  }
}
