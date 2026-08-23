/**
 * Posición del móvil — el dominio, sin Nest y sin HTTP.
 *
 * Tarea 3.7. Todo lo que se puede probar sin levantar un servidor vive aquí:
 * validar un reporte, decidir si una posición es creíble, y traducir un punto
 * a la localidad de Bogotá que le corresponde.
 *
 * ── EL LÍMITE QUE NO SE CRUZA ─────────────────────────────────────
 * PULSO le MUESTRA la cobertura al CRUE; no asigna móviles. Reposicionar
 * ambulancias es función legal del CRUE (Res. 1220/2010). Por eso en este
 * archivo no hay —ni debe haber— nada que elija un móvil para un caso,
 * proponga un traslado de base, ni ordene un desplazamiento.
 *
 * ── SIN PII ───────────────────────────────────────────────────────
 * Las coordenadas de una ambulancia con paciente a bordo son dato sensible.
 * No entran en una URL (viajan en el cuerpo del PUT) y no se loguean: este
 * archivo no tiene Logger a propósito.
 */

import type { Coordenada, Sede, TipoMovil } from '../contracts/types';
import { distanciaKm } from '../common/geo';

// ─────────────────────────────────────────────────────────────────
// Entidades
// ─────────────────────────────────────────────────────────────────

/**
 * Un móvil registrado.
 *
 * PROVISIONAL hasta la tarea 3.6 (Zaid), que crea la tabla `movil` y hace que
 * `tipo` salga del registro y no del cliente. Mientras tanto `tipo` puede ser
 * null: "no lo sabemos", que es distinto de "es un TAB". Un TAB que se pinte
 * como TAM en el mapa del CRUE es peor que un móvil sin clasificar.
 */
export interface MovilRegistrado {
  /** Indicativo del móvil, ej. "AMB-014". No es PII. */
  id: string;
  organizacionId: string;
  /** null = tipo sin verificar. Ver `tipoVerificado` en la respuesta HTTP. */
  tipo: TipoMovil | null;
}

/** El último arreglo de GPS que reportó un móvil. */
export interface PosicionReportada {
  coord: Coordenada;
  /**
   * `coords.accuracy` del navegador, en metros.
   *
   * ⚠️ NO ES DECORATIVA. En interiores, en un parqueadero o entre edificios el
   * navegador se equivoca por cientos de metros, y un punto sin su radio de
   * error se lee como una certeza que no existe. Viaja hasta el mapa del CRUE
   * justo para poder dibujarla.
   */
  precisionM: number | null;
  velocidadKmh: number | null;
  /**
   * Sello del SERVIDOR, no del tablet.
   *
   * El reloj de un dispositivo de campo se desfasa; si la antigüedad de una
   * posición se calculara contra un `ts` del cliente, un móvil con la hora mal
   * puesta aparecería siempre "en vivo" o siempre "vencido".
   */
  reportadoEn: string;
}

/** Lo que el almacén guarda por móvil. */
export interface EstadoMovil {
  movil: MovilRegistrado;
  disponible: boolean;
  /** null = registrado y sin un solo reporte todavía. */
  ultima: PosicionReportada | null;
}

// ─────────────────────────────────────────────────────────────────
// Validación del reporte
// ─────────────────────────────────────────────────────────────────

export interface ReporteEstado {
  lat: number;
  lng: number;
  velocidadKmh: number | null;
  precisionM: number | null;
  disponible: boolean;
}

export type Validacion<T> =
  | { ok: true; valor: T }
  | { ok: false; motivo: string };

/**
 * Caja generosa alrededor de Bogotá y la Sabana. La misma idea que
 * `useGeolocalizacion` en el frontend, repetida aquí porque una validación que
 * solo vive en el cliente no es una validación.
 *
 * El modo de fallo que evita: sin GPS el navegador geolocaliza por IP, y con
 * una VPN eso pone la ambulancia en otro país. Sin este corte, el mapa de
 * cobertura del CRUE pinta un pin en Ohio y nadie ve un error en pantalla.
 */
const BOGOTA = { latMin: 3.9, latMax: 5.1, lngMin: -75.0, lngMax: -73.5 };

/** 300 km/h: por encima de eso no es una ambulancia, es un dato roto. */
const VELOCIDAD_MAX_KMH = 300;

/** 10 km de radio de error ya no es una posición, es la ciudad entera. */
const PRECISION_MAX_M = 10_000;

function finito(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Lee el cuerpo de `PUT /moviles/:id/estado`.
 *
 * Devuelve un resultado en vez de lanzar: así se prueba sin Nest y el
 * controlador decide qué excepción HTTP corresponde. Cada rechazo trae el
 * motivo en español porque lo lee un humano en la consola de campo.
 */
export function validarReporte(cuerpo: unknown): Validacion<ReporteEstado> {
  if (typeof cuerpo !== 'object' || cuerpo === null) {
    return { ok: false, motivo: 'Cuerpo vacío o mal formado' };
  }
  const c = cuerpo as Record<string, unknown>;

  if (!finito(c.lat) || !finito(c.lng)) {
    return { ok: false, motivo: 'lat y lng son obligatorios y numéricos' };
  }
  if (c.lat < -90 || c.lat > 90 || c.lng < -180 || c.lng > 180) {
    return { ok: false, motivo: 'lat o lng fuera de rango' };
  }
  if (
    c.lat <= BOGOTA.latMin ||
    c.lat >= BOGOTA.latMax ||
    c.lng <= BOGOTA.lngMin ||
    c.lng >= BOGOTA.lngMax
  ) {
    return {
      ok: false,
      motivo: 'La posición cae fuera del área de cobertura de Bogotá',
    };
  }

  // `disponible` es obligatorio a propósito: el mapa del CRUE lo pinta como
  // libre/ocupado, y un default (cualquiera de los dos) sería una afirmación
  // que nadie hizo sobre una ambulancia real.
  if (typeof c.disponible !== 'boolean') {
    return { ok: false, motivo: 'disponible es obligatorio y booleano' };
  }

  let velocidadKmh: number | null = null;
  if (c.velocidadKmh !== undefined && c.velocidadKmh !== null) {
    if (!finito(c.velocidadKmh) || c.velocidadKmh < 0) {
      return { ok: false, motivo: 'velocidadKmh debe ser un número >= 0' };
    }
    // Se recorta en vez de rechazar: el dato principal del reporte es la
    // posición, y tirarla entera por una velocidad absurda del sensor sería
    // perder lo que sí sirve.
    velocidadKmh = Math.min(c.velocidadKmh, VELOCIDAD_MAX_KMH);
  }

  let precisionM: number | null = null;
  if (c.precisionM !== undefined && c.precisionM !== null) {
    if (!finito(c.precisionM) || c.precisionM <= 0) {
      return { ok: false, motivo: 'precisionM debe ser un número > 0' };
    }
    precisionM = Math.min(Math.round(c.precisionM), PRECISION_MAX_M);
  }

  return {
    ok: true,
    valor: {
      lat: c.lat,
      lng: c.lng,
      velocidadKmh,
      precisionM,
      disponible: c.disponible,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Localidad
// ─────────────────────────────────────────────────────────────────

/**
 * Más allá de esto, decir "está en Kennedy" porque la sede más cercana está en
 * Kennedy deja de ser una aproximación y pasa a ser una invención.
 */
export const RADIO_LOCALIDAD_KM = 8;

/**
 * En qué localidad está este punto.
 *
 * ⚠️ ES UNA ESTIMACIÓN, y la respuesta HTTP lo declara (`localidadDerivada`).
 * Bogotá no publica aquí sus polígonos de localidad, así que se usa la
 * localidad de la sede REPS más cercana —dato real de `data/procesado/
 * sedes.json`— como proxy. Con los polígonos reales, esta función se cambia
 * por un point-in-polygon y nada más se entera.
 */
export function localidadDe(
  coord: Coordenada,
  sedes: readonly Sede[],
  radioKm = RADIO_LOCALIDAD_KM,
): string | null {
  let mejor: { localidad: string; km: number } | null = null;

  for (const s of sedes) {
    if (!s.localidad) continue;
    const km = distanciaKm(coord.lat, coord.lng, s.coord.lat, s.coord.lng);
    if (km > radioKm) continue;
    if (!mejor || km < mejor.km) mejor = { localidad: s.localidad, km };
  }

  return mejor?.localidad ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Identificador del móvil
// ─────────────────────────────────────────────────────────────────

/**
 * Deja el indicativo en la forma en que el CRUE lo lee.
 *
 * Mismo criterio que `lib/unidad.ts#normalizarId` en el frontend, repetido en
 * el servidor porque el cliente puede no haberlo aplicado: "amb 14", "AMB-14"
 * y "Amb-014" son tres filas distintas en el tablero del regulador y nadie las
 * va a reconciliar a las 3 de la mañana.
 *
 * Devuelve "" si no queda nada utilizable — el llamador lo trata como 400.
 */
export function normalizarMovilId(crudo: string): string {
  return crudo.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 24);
}
