/**
 * Logica del handshake.
 *
 * Vive aca y NO dentro de un route.ts porque Next valida los exports de
 * los route handlers: solo acepta GET/POST/etc. y config. Exportar una
 * funcion extra desde un route.ts revienta el build.
 *
 * Dos clientes la llaman: la consola web /hospital y el webhook de Telegram.
 */

import type { RespondRequest, RespondResponse } from "./types";
import { obtenerHandshake, guardarHandshake, registrarRespuesta } from "./almacen";
import { sedePorCodigo } from "./db";
import { indiceCongestion } from "./congestion";

export type ResultadoRespuesta =
  | RespondResponse
  | { error: string; status?: number };

/**
 * ⭐ EL NUCLEO DEL PRODUCTO.
 *
 * El jefe de urgencias aprieta un boton que de todas formas iba a apretar
 * (hoy lo dice por telefono y se pierde en el aire). Esa respuesta:
 *   1. desbloquea al paramedico
 *   2. actualiza el posterior Beta-Bernoulli de P(aceptacion) de la sede
 *   3. empuja el indice de congestion de la sede
 *
 * Nadie reporto nada. La red aprendio sola.
 */
export async function procesarRespuesta(
  cuerpo: RespondRequest
): Promise<ResultadoRespuesta> {
  const h = obtenerHandshake(cuerpo.handshakeId);
  if (!h) return { error: "Handshake no encontrado", status: 404 };

  // Idempotencia: sin esto, un doble toque en el celular duplica la senal
  // y ensucia el modelo. En un demo en vivo esto pasa siempre.
  if (h.estado !== "enviado") {
    const sede = await sedePorCodigo(h.sedeCodigo);
    return {
      handshake: h,
      congestionActualizada: sede ? indiceCongestion(sede) : 0,
    };
  }

  const ahora = new Date();
  const enviado = new Date(h.enviadoEn);

  const actualizado = {
    ...h,
    estado: cuerpo.decision,
    motivoRechazo:
      cuerpo.decision === "rechazado" ? (cuerpo.motivo ?? "Saturación") : null,
    respondidoEn: ahora.toISOString(),
    latenciaS: Math.round((ahora.getTime() - enviado.getTime()) / 1000),
  };
  guardarHandshake(actualizado);

  // ⭐ El dato se etiqueta solo.
  registrarRespuesta(h.sedeCodigo, cuerpo.decision);

  const sede = await sedePorCodigo(h.sedeCodigo);
  const congestionActualizada = sede ? indiceCongestion(sede) : 0;

  console.log(
    `[pulso] ${h.sedeCodigo} → ${cuerpo.decision} en ${actualizado.latenciaS}s ` +
      `· congestión ahora ${(congestionActualizada * 100).toFixed(0)}%`
  );

  return { handshake: actualizado, congestionActualizada };
}
