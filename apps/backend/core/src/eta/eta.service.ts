/**
 * ETA con tráfico real vía Mapbox Matrix API (perfil driving-traffic).
 *
 * ⚠️ LÍMITE IMPORTANTE: el perfil `driving-traffic` acepta pocas coordenadas
 *    por llamada (mucho menos que `driving`). Por eso SIEMPRE pre-filtramos a
 *    los N más cercanos por haversine antes de llamar. Ver MAX_DESTINOS.
 *    Si Mapbox devuelve 422, es eso: baja el número, no subas el límite.
 *
 * Sin token → cae a una estimación por distancia. El sistema no se cae, solo
 * pierde precisión.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Coordenada } from '../contracts/types';
import { distanciaKm } from '../common/geo';

/** Origen + destinos no puede pasar de esto en driving-traffic. */
export const MAX_DESTINOS = 9;

/**
 * Velocidad media efectiva en Bogotá en hora pico, puerta a puerta,
 * incluyendo el "último tramo" de entrar a urgencias. Conservador a propósito.
 */
const KMH_FALLBACK = 22;

export interface ResultadoEta {
  codigo: string;
  etaMin: number;
  distKm: number;
  /** true si vino de Mapbox, false si es la estimación por distancia. */
  conTrafico: boolean;
  provenance: 'mapbox' | 'haversine_fallback';
}

export interface DestinoEta {
  codigo: string;
  coord: Coordenada;
}

@Injectable()
export class EtaService {
  private readonly log = new Logger(EtaService.name);

  constructor(private readonly config: ConfigService) {}

  private token(): string | undefined {
    return this.config.get<string>('MAPBOX_TOKEN');
  }

  /**
   * Una sola llamada → ETA a todos los destinos.
   * Si le pasan más de MAX_DESTINOS, se queda con los más cercanos.
   */
  async matriz(
    origen: Coordenada,
    destinos: DestinoEta[],
  ): Promise<ResultadoEta[]> {
    const conDistancia = destinos
      .map((d) => ({
        ...d,
        distKm: distanciaKm(origen.lat, origen.lng, d.coord.lat, d.coord.lng),
      }))
      .sort((a, b) => a.distKm - b.distKm);

    const recortados = conDistancia.slice(0, MAX_DESTINOS);
    const token = this.token();

    if (!token || recortados.length === 0) {
      return recortados.map((d) => this.estimado(d.codigo, d.distKm));
    }

    // Mapbox espera lng,lat (al revés de lo intuitivo). Origen primero.
    const coords = [origen, ...recortados.map((d) => d.coord)]
      .map((c) => `${c.lng},${c.lat}`)
      .join(';');

    const destinationIdx = recortados.map((_, i) => i + 1).join(';');
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/${coords}` +
      `?sources=0&destinations=${destinationIdx}` +
      `&annotations=duration,distance&access_token=${token}`;

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Mapbox ${res.status}`);
      const json = (await res.json()) as {
        durations?: (number | null)[][];
        distances?: (number | null)[][];
      };

      const duraciones = json.durations?.[0] ?? [];
      const distancias = json.distances?.[0] ?? [];

      return recortados.map((d, i) => {
        const seg = duraciones[i];
        const met = distancias[i];
        if (seg == null) return this.estimado(d.codigo, d.distKm);
        return {
          codigo: d.codigo,
          etaMin: redondear(seg / 60),
          distKm: redondear(met != null ? met / 1000 : d.distKm),
          conTrafico: true,
          provenance: 'mapbox',
        };
      });
    } catch (e) {
      this.log.warn(`Mapbox Matrix falló, usando estimación: ${String(e)}`);
      return recortados.map((d) => this.estimado(d.codigo, d.distKm));
    }
  }

  /**
   * Geometría de la ruta al destino elegido, para pintarla en el mapa.
   * Devuelve un GeoJSON LineString, o null si no hay token.
   */
  async ruta(
    origen: Coordenada,
    destino: Coordenada,
  ): Promise<GeoJSON.LineString | null> {
    const token = this.token();
    if (!token) return null;
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
      `${origen.lng},${origen.lat};${destino.lng},${destino.lat}` +
      `?geometries=geojson&overview=full&access_token=${token}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        routes?: { geometry: GeoJSON.LineString }[];
      };
      return json.routes?.[0]?.geometry ?? null;
    } catch {
      return null;
    }
  }

  private estimado(codigo: string, distKm: number): ResultadoEta {
    return {
      codigo,
      etaMin: estimarMinutos(distKm),
      distKm: redondear(distKm),
      conTrafico: false,
      provenance: 'haversine_fallback',
    };
  }
}

export const selectEtaEstimate = (primaryMinutes: number | null, fallbackMinutes: number) => primaryMinutes == null ? { etaMin: fallbackMinutes, provenance: 'haversine_fallback' as const } : { etaMin: primaryMinutes, provenance: 'mapbox' as const };

/** Factor 1.35 por el trazado real de calles vs. línea recta en Bogotá. */
function estimarMinutos(distKm: number): number {
  return redondear(((distKm * 1.35) / KMH_FALLBACK) * 60);
}

function redondear(n: number): number {
  return Math.round(n * 10) / 10;
}
