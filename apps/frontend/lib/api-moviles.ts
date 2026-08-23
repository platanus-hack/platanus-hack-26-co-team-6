/**
 * Cliente de la flota (tarea 3.7).
 *
 * Vive fuera de `lib/api.ts` a propósito: ese archivo es el más compartido del
 * frontend y crecer por acumulación lo convierte en el sitio donde chocan
 * todos los merges. Lo que sí se reutiliza —y por eso se importa en vez de
 * copiarse— es `pedir`: ahí están `credentials: "include"`, la renovación
 * silenciosa del access y la lectura de los dos formatos de error de core. Un
 * `fetch` suelto aquí se saltaría las tres.
 *
 * ── SIN PII EN LA URL ─────────────────────────────────────────────
 * La posición viaja en el CUERPO del PUT. Una URL acaba en el access log del
 * proxy y en el historial del navegador, y las coordenadas de una ambulancia
 * con paciente a bordo no pueden acabar ahí. En la ruta solo va el indicativo
 * del móvil, que es lo que se dice por radio en abierto todo el día.
 */

import { pedir, ErrorApi } from "./api";
import type { MovilCobertura } from "./posicion-modelo";

/** Lo que devuelve `GET /moviles`. El alcance ya viene aplicado por el servidor. */
export interface RespuestaMoviles {
  moviles: MovilCobertura[];
  /** 'red' = ve la ciudad (CRUE). 'organizacion' = solo su flota. */
  alcance: "organizacion" | "red";
  /**
   * 'provisional' mientras la tarea 1.3 no emita actores reales. La consola LO
   * DICE: un alcance resuelto con una contraseña de turno compartida no se
   * puede pintar igual que uno con identidad verificada.
   */
  identidad: "actor" | "provisional";
  /** De dónde sale `localidad` de cada móvil. Hoy: la sede REPS más cercana. */
  localidadDerivada: "sede-mas-cercana";
  ts: string;
}

export interface ReporteEstado {
  lat: number;
  lng: number;
  /** `coords.accuracy` del navegador. Se manda para poder dibujar el error. */
  precisionM?: number | null;
  velocidadKmh?: number | null;
  /** Obligatorio: libre u ocupado es lo que el CRUE lee en el mapa. */
  disponible: boolean;
}

/**
 * La flota que le corresponde ver a quien pregunta.
 *
 * El recorte por organización lo hace core sobre la lista completa. Este
 * cliente no filtra nada: un filtro en el navegador sería decoración — la
 * respuesta ya habría salido del servidor con la flota ajena dentro.
 */
export function moviles(): Promise<RespuestaMoviles> {
  return pedir<RespuestaMoviles>("/moviles", { cache: "no-store" });
}

/**
 * Reporta dónde está este móvil.
 *
 * Se llama con throttle desde `/campo` (ver `INTERVALO_REPORTE_MS` en
 * `posicion-modelo.ts`) y **solo con un caso abierto**. Un 403 aquí significa
 * que el móvil no es de esta organización: no se reintenta, se dice.
 */
export function reportarEstado(
  movilId: string,
  estado: ReporteEstado,
): Promise<MovilCobertura> {
  return pedir<MovilCobertura>(
    `/moviles/${encodeURIComponent(movilId)}/estado`,
    { method: "PUT", body: JSON.stringify(estado) },
  );
}

/**
 * ¿Este error dice "no vuelvas a intentarlo"?
 *
 * Un 403 o un 400 en un reporte de posición no se arreglan repitiendo el
 * reporte cada 15 s durante todo el turno: o el móvil no es de esta
 * organización, o el cuerpo está mal. Reintentar sería una tormenta silenciosa
 * contra el servidor.
 */
export function esDefinitivo(error: unknown): boolean {
  return error instanceof ErrorApi && error.status >= 400 && error.status < 500;
}

/**
 * Qué decirle al paramédico cuando un reporte no entra.
 *
 * ⚠️ NO se usa el mensaje que vino del servidor, y no es descuido: el filtro
 * global de core (`common/pulso-error.filter.ts`) reescribe TODO 4xx como
 * `{ code: "PULSO_INVALID_INPUT", message: "Invalid request" }`. El motivo que
 * el controlador redacta con cuidado —"la posición cae fuera del área de
 * cobertura de Bogotá"— nunca cruza la red. Pintar "Invalid request" en una
 * consola de campo es peor que no decir nada, así que el texto se arma aquí
 * con lo único fiable que llega: el código HTTP.
 *
 * Si algún día el filtro deja pasar el mensaje de dominio, esta función se
 * queda como respaldo y se prefiere el del servidor.
 */
export function mensajeDeError(error: unknown): string {
  if (!(error instanceof ErrorApi)) return "no se pudo contactar al servidor";
  if (error.status === 403) {
    return "este móvil no está registrado en tu organización";
  }
  if (error.status === 400) {
    return "el servidor rechazó la posición (¿ubicación fuera de Bogotá?)";
  }
  if (error.status === 404) return "core todavía no expone /moviles";
  return `core respondió ${error.status}`;
}
