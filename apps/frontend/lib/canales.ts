/**
 * Canales del handshake de un toque.
 *
 * ESTRATEGIA (leer antes de tocar):
 *  - TELEGRAM es el canal PRIMARIO del demo. Inline keyboards, cero
 *    aprobacion, funciona en 15 minutos. Es la red de seguridad.
 *  - WHATSAPP es la VITRINA. Impresiona mas, pero mandar un mensaje
 *    iniciado por el negocio exige una plantilla aprobada por Meta que
 *    tarda 24-48h. Truco del demo: que el "jefe de urgencias" le escriba
 *    primero al numero → se abre la ventana de 24h → los botones
 *    interactivos fluyen sin plantilla.
 *  - CONSOLA es el fallback absoluto: la pantalla web del hospital.
 *    Si se cae el wifi de los celulares, el demo sigue.
 *
 * Sin tokens configurados, todo esto loguea a consola y devuelve true.
 * El flujo nunca se rompe por falta de credenciales.
 */

import type { Caso, Handshake, Sede } from "./types";
import { nombresServicios, ETIQUETA_TRIAGE, esHoraDorada } from "./servicios-reps";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID_DEMO;
const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WA_TO = process.env.WHATSAPP_TO_DEMO;

/** URL publica de la app, para armar los enlaces de los botones. */
function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * El texto de la tarjeta que ve el jefe de urgencias.
 * Tiene que ser leible de un vistazo, en un celular, a las 3 de la manana.
 * Nada de parrafos.
 */
export function textoTarjeta(caso: Caso, sede: Sede, etaMin?: number): string {
  const bandera = esHoraDorada(caso.triage) ? "🔴" : "🟡";
  const lineas = [
    `${bandera} *SOLICITUD DE TRASLADO — PULSO*`,
    ``,
    `*${sede.nombre}*`,
    `Triage ${ETIQUETA_TRIAGE[caso.triage]}`,
    ``,
    `${caso.resumen}`,
    ``,
    `• Paciente: ${caso.edad ?? "?"} años, ${caso.sexo === "M" ? "masculino" : caso.sexo === "F" ? "femenino" : "sexo no referido"}`,
    caso.dxCie10 ? `• Dx probable: ${caso.dxDescripcion} (${caso.dxCie10})` : `• Dx probable: ${caso.dxDescripcion}`,
    `• Requiere: ${nombresServicios(caso.serviciosRequeridos)}`,
    `• Móvil: ${caso.tipoMovil}`,
    etaMin != null ? `• ETA: ${Math.round(etaMin)} min` : null,
    caso.signosAlarma.length ? `• Alarma: ${caso.signosAlarma.join(", ")}` : null,
  ].filter(Boolean);
  return lineas.join("\n");
}

export interface ResultadoEnvio {
  enviado: boolean;
  canal: string;
  detalle?: string;
}

// ─────────────────────────────────────────────────────────────────
// Telegram — canal primario
// ─────────────────────────────────────────────────────────────────

export async function enviarTelegram(
  handshake: Handshake,
  caso: Caso,
  sede: Sede,
  etaMin?: number
): Promise<ResultadoEnvio> {
  if (!TG_TOKEN || !TG_CHAT) {
    console.log("\n──────── [PULSO · Telegram no configurado] ────────");
    console.log(textoTarjeta(caso, sede, etaMin));
    console.log(`Responder en: ${baseUrl()}/hospital`);
    console.log("───────────────────────────────────────────────────\n");
    return { enviado: true, canal: "telegram(mock)", detalle: "sin token, logueado a consola" };
  }

  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;

  // callback_data tiene tope de 64 bytes. "a:<uuid>" cabe de sobra.
  const teclado = {
    inline_keyboard: [
      [
        { text: "✅ Aceptar traslado", callback_data: `a:${handshake.id}` },
        { text: "⛔ Rechazar por saturación", callback_data: `r:${handshake.id}` },
      ],
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text: textoTarjeta(caso, sede, etaMin),
        parse_mode: "Markdown",
        reply_markup: teclado,
      }),
    });
    const json = await res.json();
    if (!json.ok) return { enviado: false, canal: "telegram", detalle: json.description };
    return { enviado: true, canal: "telegram" };
  } catch (e) {
    return { enviado: false, canal: "telegram", detalle: String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────
// WhatsApp Cloud API — la vitrina
// ─────────────────────────────────────────────────────────────────

/**
 * Mensaje interactivo con botones de respuesta.
 * ⚠️ Solo funciona DENTRO de la ventana de 24h (el destinatario escribio
 *    primero). Fuera de la ventana hace falta plantilla aprobada.
 *    Antes del demo: que el celular receptor le escriba "hola" al numero.
 */
export async function enviarWhatsApp(
  handshake: Handshake,
  caso: Caso,
  sede: Sede,
  etaMin?: number
): Promise<ResultadoEnvio> {
  if (!WA_TOKEN || !WA_PHONE_ID || !WA_TO) {
    return { enviado: false, canal: "whatsapp", detalle: "sin credenciales" };
  }

  const url = `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: WA_TO,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: textoTarjeta(caso, sede, etaMin).replace(/\*/g, "*") },
          action: {
            buttons: [
              { type: "reply", reply: { id: `a:${handshake.id}`, title: "Aceptar" } },
              { type: "reply", reply: { id: `r:${handshake.id}`, title: "Rechazar" } },
            ],
          },
        },
      }),
    });
    const json = await res.json();
    if (json.error) return { enviado: false, canal: "whatsapp", detalle: json.error.message };
    return { enviado: true, canal: "whatsapp" };
  } catch (e) {
    return { enviado: false, canal: "whatsapp", detalle: String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────
// Despachador
// ─────────────────────────────────────────────────────────────────

/**
 * Intenta el canal pedido; si falla, cae al siguiente. La consola web
 * siempre funciona, asi que nunca devolvemos "no se pudo notificar".
 */
export async function notificar(
  handshake: Handshake,
  caso: Caso,
  sede: Sede,
  etaMin?: number
): Promise<ResultadoEnvio> {
  if (handshake.canal === "whatsapp") {
    const wa = await enviarWhatsApp(handshake, caso, sede, etaMin);
    if (wa.enviado) return wa;
    console.warn("[pulso] WhatsApp falló, cayendo a Telegram:", wa.detalle);
  }
  if (handshake.canal !== "consola") {
    const tg = await enviarTelegram(handshake, caso, sede, etaMin);
    if (tg.enviado) return tg;
  }
  return { enviado: true, canal: "consola", detalle: "visible en /hospital" };
}
