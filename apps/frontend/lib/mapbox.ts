/**
 * ETA con trafico real via Mapbox Matrix API (perfil driving-traffic).
 *
 * ⚠️ LIMITE IMPORTANTE: el perfil `driving-traffic` acepta pocas coordenadas
 *    por llamada (mucho menos que `driving`). Por eso SIEMPRE pre-filtramos
 *    a los N mas cercanos por haversine (PostGIS en produccion) antes de
 *    llamar. Ver MAX_DESTINOS.
 *
 * Sin token → cae a una estimacion por distancia. El sistema no se cae,
 * solo pierde precision. Juan puede trabajar todo el dia sin token.
 */

import type { Coordenada } from "./types";
import { distanciaKm } from "./db";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/** Origen + destinos no puede pasar de esto en driving-traffic. */
export const MAX_DESTINOS = 9;

/**
 * Velocidad media efectiva en Bogota en hora pico, puerta a puerta,
 * incluyendo el "ultimo tramo" de entrar a urgencias. Conservador a proposito.
 */
const KMH_FALLBACK = 22;

export interface ResultadoEta {
  codigo: string;
  etaMin: number;
  distKm: number;
  /** true si vino de Mapbox, false si es la estimacion por distancia. */
  conTrafico: boolean;
}

export interface DestinoEta {
  codigo: string;
  coord: Coordenada;
}

/**
 * Una sola llamada → ETA a todos los destinos.
 * Si le pasan mas de MAX_DESTINOS, se queda con los mas cercanos.
 */
export async function matrizEta(
  origen: Coordenada,
  destinos: DestinoEta[]
): Promise<ResultadoEta[]> {
  const conDistancia = destinos
    .map((d) => ({
      ...d,
      distKm: distanciaKm(origen.lat, origen.lng, d.coord.lat, d.coord.lng),
    }))
    .sort((a, b) => a.distKm - b.distKm);

  const recortados = conDistancia.slice(0, MAX_DESTINOS);

  if (!TOKEN || recortados.length === 0) {
    return recortados.map((d) => ({
      codigo: d.codigo,
      etaMin: estimarMinutos(d.distKm),
      distKm: redondear(d.distKm),
      conTrafico: false,
    }));
  }

  // Mapbox espera lng,lat (al reves de lo intuitivo). Origen primero.
  const coords = [origen, ...recortados.map((d) => d.coord)]
    .map((c) => `${c.lng},${c.lat}`)
    .join(";");

  const destinationIdx = recortados.map((_, i) => i + 1).join(";");
  const url =
    `https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/${coords}` +
    `?sources=0&destinations=${destinationIdx}` +
    `&annotations=duration,distance&access_token=${TOKEN}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Mapbox ${res.status}`);
    const json = await res.json();

    const duraciones: (number | null)[] = json.durations?.[0] ?? [];
    const distancias: (number | null)[] = json.distances?.[0] ?? [];

    return recortados.map((d, i) => {
      const seg = duraciones[i];
      const met = distancias[i];
      if (seg == null) {
        return {
          codigo: d.codigo,
          etaMin: estimarMinutos(d.distKm),
          distKm: redondear(d.distKm),
          conTrafico: false,
        };
      }
      return {
        codigo: d.codigo,
        etaMin: redondear(seg / 60),
        distKm: redondear(met != null ? met / 1000 : d.distKm),
        conTrafico: true,
      };
    });
  } catch (e) {
    console.warn("[pulso] Mapbox Matrix falló, usando estimación:", e);
    return recortados.map((d) => ({
      codigo: d.codigo,
      etaMin: estimarMinutos(d.distKm),
      distKm: redondear(d.distKm),
      conTrafico: false,
    }));
  }
}

/**
 * Geometria de la ruta al destino elegido, para pintarla en el mapa.
 * Devuelve un GeoJSON LineString, o null si no hay token.
 */
export async function rutaHasta(
  origen: Coordenada,
  destino: Coordenada
): Promise<GeoJSON.LineString | null> {
  if (!TOKEN) return null;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
    `${origen.lng},${origen.lat};${destino.lng},${destino.lat}` +
    `?geometries=geojson&overview=full&access_token=${TOKEN}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.routes?.[0]?.geometry ?? null;
  } catch {
    return null;
  }
}

/** Factor 1.35 por el trazado real de calles vs. linea recta en Bogota. */
function estimarMinutos(distKm: number): number {
  return redondear(((distKm * 1.35) / KMH_FALLBACK) * 60);
}

function redondear(n: number): number {
  return Math.round(n * 10) / 10;
}
