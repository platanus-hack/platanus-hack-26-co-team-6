/**
 * Catalogo de servicios habilitados del REPS.
 *
 * FUENTE OFICIAL — no inventamos codigos:
 *   CodeSystem FHIR de MinSalud, 130 conceptos, CC-BY-4.0
 *   canonical: https://fhir.minsalud.gov.co/rda/CodeSystem/REPShealthcareServices
 *   navegable: https://vulcano.ihcecol.gov.co/CodeSystem-REPShealthcareServices
 *
 * ⚠️ OJO: el README original del proyecto traia codigos equivocados
 *    (decia 302 = UCI y 408 = hemodinamia). Los correctos son estos.
 *    408 es RADIOTERAPIA. Hemodinamia es 743.
 */

import type { CodServicio, Complejidad } from "../contracts/types";

export const SERVICIOS = {
  // Urgencias
  URGENCIAS: 1102,

  // Cuidado intensivo
  UCI_NEONATAL: 108,
  UCI_PEDIATRICO: 109,
  UCI_ADULTOS: 110,

  // Quirurgicos
  CIRUGIA_CABEZA_CUELLO: 201,
  CIRUGIA_GENERAL: 203,
  NEUROCIRUGIA: 245,

  // Materno-infantil
  GINECOBSTETRICIA: 320,

  // Apoyo diagnostico y terapeutico
  RADIOTERAPIA: 408,
  QUIMIOTERAPIA: 709,
  TOMA_MUESTRAS_LAB: 712,
  HEMODINAMIA: 743,
  IMAGENES_IONIZANTES: 744,
} as const;

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

/**
 * Subconjunto que el LLM puede elegir. Se lo pasamos en el prompt para que
 * no invente codigos. Neid: si agregas uno aca, agregalo tambien en
 * NOMBRE_SERVICIO o la UI mostrara "Servicio 999".
 */
export const SERVICIOS_SELECCIONABLES: CodServicio[] = [
  1102, 110, 109, 108, 743, 245, 203, 201, 320, 744, 712,
];

/** Orden para comparar complejidades: alta >= media >= baja */
const ORDEN_COMPLEJIDAD: Record<Complejidad, number> = {
  baja: 0,
  media: 1,
  alta: 2,
};

export function complejidadSuficiente(
  sede: Complejidad,
  requerida: Complejidad
): boolean {
  return ORDEN_COMPLEJIDAD[sede] >= ORDEN_COMPLEJIDAD[requerida];
}

/**
 * FILTRO DURO. Devuelve los servicios exigidos que la sede NO tiene.
 * Array vacio = la sede es viable.
 *
 * Urgencias (1102) siempre es obligatorio: si no tiene urgencias
 * habilitadas, no puede recibir un traslado de emergencia.
 */
export function serviciosFaltantes(
  serviciosSede: CodServicio[],
  serviciosRequeridos: CodServicio[]
): CodServicio[] {
  const tiene = new Set(serviciosSede);
  const exigidos = new Set<CodServicio>([SERVICIOS.URGENCIAS, ...serviciosRequeridos]);
  return [...exigidos].filter((s) => !tiene.has(s));
}

/**
 * Un TAB no puede trasladar un paciente que requiere medico a bordo.
 * Esto no pondera: descarta.
 */
export function movilCompatible(
  tipoMovil: "TAB" | "TAM",
  requiereMedicoABordo: boolean
): boolean {
  return !requiereMedicoABordo || tipoMovil === "TAM";
}

/** Tiempo maximo de atencion por nivel de triage (Res. 5596/2015), en minutos. */
export const MINUTOS_MAX_TRIAGE: Record<number, number> = {
  1: 0, // inmediato
  2: 30,
  3: 120,
  4: 240,
  5: 360,
};

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
