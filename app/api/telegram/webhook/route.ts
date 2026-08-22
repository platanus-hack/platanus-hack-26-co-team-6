/**
 * POST /api/telegram/webhook — CARRIL DE SEBAS
 *
 * Recibe los toques de los inline keyboards de Telegram.
 *
 * ─── COMO CONECTARLO (5 minutos) ─────────────────────────────────
 * 1. Deploy a Vercel (o `npx localtunnel --port 3000` en local).
 * 2. Registrar el webhook, una sola vez:
 *
 *    curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<TU-APP>/api/telegram/webhook"
 *
 * 3. Verificar:
 *    curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
 *
 * ⚠️ Telegram exige HTTPS. En localhost puro no funciona: usa el deploy
 *    de Vercel o un tunel. Por eso el plan dice desplegar en la hora 1.
 * ─────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { procesarRespuesta } from "@/lib/handshake";

export const runtime = "nodejs";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function POST(req: Request) {
  let update: any;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cb = update.callback_query;
  if (!cb?.data) {
    // Mensaje normal, no un boton. Respondemos el chat_id para que Sebas
    // pueda copiarlo a TELEGRAM_CHAT_ID_DEMO sin pelear con getUpdates.
    const chatId = update.message?.chat?.id;
    if (chatId && TOKEN) {
      await responderTexto(
        chatId,
        `PULSO conectado ✅\nTu chat_id es: ${chatId}\n\nPéguelo en TELEGRAM_CHAT_ID_DEMO.`
      );
    }
    return NextResponse.json({ ok: true });
  }

  // callback_data viene como "a:<uuid>" o "r:<uuid>"
  const [prefijo, handshakeId] = String(cb.data).split(":");
  const decision = prefijo === "a" ? "aceptado" : "rechazado";

  const resultado = await procesarRespuesta({
    handshakeId,
    decision,
    motivo: decision === "rechazado" ? "Saturación del servicio" : undefined,
  });

  const hubo = !("error" in resultado);
  const texto = hubo
    ? decision === "aceptado"
      ? `✅ Traslado ACEPTADO · respondido en ${resultado.handshake.latenciaS}s`
      : `⛔ Rechazado por saturación · PULSO está re-ruteando`
    : "No se encontró la solicitud";

  if (TOKEN) {
    // Quita el teclado para que no se pueda tocar dos veces.
    await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cb.id, text: texto }),
    });
    await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: texto, callback_data: "noop" }]] },
      }),
    });
  }

  return NextResponse.json({ ok: true });
}

async function responderTexto(chatId: number, texto: string) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
}
