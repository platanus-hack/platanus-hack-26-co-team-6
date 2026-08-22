/**
 * Helpers de presentación.
 *
 * Solo etiquetas y formato: cómo se LEE un código o un nivel de triage en
 * pantalla. La lógica que DECIDE con esos códigos (filtro duro de servicios,
 * compatibilidad de móvil, complejidad) vive en core y no se duplica aquí.
 *
 * La tabla de nombres sí se duplica, y es a propósito: pintar "Servicio 743"
 * en vez de "Hemodinamia" por una llamada de red que falló sería peor.
 */

import type { CodServicio } from "./types";

export const NOMBRE_SERVICIO: Record<number, string> = {
  108: "Cuidado intensivo neonatal",
  109: "Cuidado intensivo pediátrico",
  110: "Cuidado intensivo adultos",
  201: "Cirugía de cabeza y cuello",
  203: "Cirugía general",
  245: "Neurocirugía",
  320: "Ginecobstetricia",
  408: "Radioterapia",
  709: "Quimioterapia",
  712: "Toma de muestras de laboratorio clínico",
  743: "Hemodinamia e intervencionismo",
  744: "Imágenes diagnósticas ionizantes",
  1102: "Urgencias",
};

export function nombreServicio(cod: CodServicio): string {
  return NOMBRE_SERVICIO[cod] ?? `Servicio ${cod}`;
}

export function nombresServicios(cods: CodServicio[]): string {
  return cods.map(nombreServicio).join(" + ");
}

export const ETIQUETA_TRIAGE: Record<number, string> = {
  1: "I · Inmediato",
  2: "II · ≤ 30 min",
  3: "III · ≤ 120 min",
  4: "IV · ≤ 240 min",
  5: "V · ≤ 360 min",
};

/** Triage I y II entran al carril rojo de hora dorada. */
export function esHoraDorada(triage: number): boolean {
  return triage <= 2;
}
