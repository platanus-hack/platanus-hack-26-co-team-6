/**
 * Indice de congestion — 0 (vacio) a 1 (colapsado).
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LEER ESTO ANTES DEL PITCH
 * ═══════════════════════════════════════════════════════════════════
 *  No estamos midiendo camas en tiempo real. No tenemos ese sensor y
 *  nadie en 36h lo tiene. Lo que hacemos es mejor de explicar y ademas
 *  es cierto:
 *
 *    El acto de rechazar YA ES el sensor.
 *
 *  Hoy ese rechazo se pierde en una llamada telefonica. PULSO lo captura,
 *  lo fecha, y lo convierte en el prior de la siguiente decision. Cero
 *  friccion para el hospital: no tipea nada, solo aprieta un boton que
 *  ya iba a apretar.
 *
 *  El dataset "Registro diario de ocupacion de capacidad instalada"
 *  (uwc4-gvg3 en datos.gov.co) tiene 8.389 filas y UNA SOLA FECHA:
 *  2022-11-30. El Estado ya intento pedir el reporte manual. Se apago.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { Sede } from "./types";
import { rechazosEnVentana } from "./almacen";

/** Pesos de las cuatro senales. Suman 1. */
export const PESOS = {
  ocupacionBase: 0.35,
  horario: 0.2,
  rechazoReciente: 0.35, // ← la senal viva
  epidemiologico: 0.1,
} as const;

/**
 * Senal 1 — ocupacion estructural.
 * Sale del snapshot REPS. Es un PRIOR de "que tan apretada vive esta sede",
 * no la ocupacion de hoy. Ponderamos doble las camas de UCI porque son
 * el cuello de botella real de un traslado de alta complejidad.
 */
export function ocupacionBase(sede: Sede): number {
  if (!sede.camas.length) return 0.7; // sin dato → asumimos apretado

  let numerador = 0;
  let denominador = 0;
  for (const c of sede.camas) {
    if (c.total <= 0) continue;
    const peso = /UCI|Intensivo/i.test(c.tipo) ? 2 : 1;
    numerador += (c.ocupadasSnapshot / c.total) * peso;
    denominador += peso;
  }
  return denominador ? clamp01(numerador / denominador) : 0.7;
}

/**
 * Senal 2 — curva de demanda de urgencias.
 * Los picos reales de urgencias en Bogota son al final de la tarde/noche
 * y los fines de semana. Devuelve 0..1 donde 1 = pico.
 */
export function factorHorario(fecha = new Date()): number {
  const hora = fecha.getHours();
  const dia = fecha.getDay(); // 0 = domingo

  // Curva diurna: valle de madrugada, pico 18:00-23:00
  const curvaHora: Record<number, number> = {
    0: 0.55, 1: 0.45, 2: 0.35, 3: 0.3, 4: 0.3, 5: 0.35,
    6: 0.45, 7: 0.6, 8: 0.7, 9: 0.7, 10: 0.68, 11: 0.7,
    12: 0.72, 13: 0.7, 14: 0.68, 15: 0.7, 16: 0.75, 17: 0.82,
    18: 0.9, 19: 0.95, 20: 1.0, 21: 0.95, 22: 0.85, 23: 0.7,
  };
  const base = curvaHora[hora] ?? 0.7;
  const finDeSemana = dia === 0 || dia === 6 ? 1.12 : 1.0;
  return clamp01(base * finDeSemana);
}

/**
 * Senal 3 — ⭐ la senal viva, sin fricción.
 * Cada rechazo en las ultimas 6h empuja la congestion hacia arriba.
 * Saturamos en 4 rechazos: mas alla de eso ya sabemos que esta colapsado.
 */
export function senalRechazo(sedeCodigo: string): number {
  const n = rechazosEnVentana(sedeCodigo, 6);
  return clamp01(n / 4);
}

/**
 * Senal 4 — presion epidemiologica.
 * Stub honesto: hoy es estacional (picos respiratorios en temporada de
 * lluvias bogotana, abril-mayo y octubre-noviembre). El upgrade real es
 * cruzar con SIVIGILA/INS. Si no da tiempo, se queda asi y se dice tal cual.
 */
export function presionEpidemiologica(fecha = new Date()): number {
  const mes = fecha.getMonth(); // 0 = enero
  const picoRespiratorio = [3, 4, 9, 10].includes(mes);
  return picoRespiratorio ? 0.75 : 0.4;
}

/**
 * Indice compuesto. Esto es lo que ve el paramedico como barra de color.
 */
export function indiceCongestion(sede: Sede, fecha = new Date()): number {
  const c =
    PESOS.ocupacionBase * ocupacionBase(sede) +
    PESOS.horario * factorHorario(fecha) +
    PESOS.rechazoReciente * senalRechazo(sede.codigo) +
    PESOS.epidemiologico * presionEpidemiologica(fecha);
  return clamp01(c);
}

/** Desglose para el panel de "por que" — Juan lo pinta al abrir una tarjeta. */
export function desgloseCongestion(sede: Sede, fecha = new Date()) {
  return {
    ocupacionBase: ocupacionBase(sede),
    horario: factorHorario(fecha),
    rechazoReciente: senalRechazo(sede.codigo),
    epidemiologico: presionEpidemiologica(fecha),
    total: indiceCongestion(sede, fecha),
  };
}

export function etiquetaCongestion(c: number): "baja" | "media" | "alta" | "crítica" {
  if (c < 0.5) return "baja";
  if (c < 0.7) return "media";
  if (c < 0.85) return "alta";
  return "crítica";
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
