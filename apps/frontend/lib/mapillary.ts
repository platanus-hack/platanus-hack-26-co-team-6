/**
 * Mapillary — imágenes a nivel de calle (crédito de APIs del hack).
 *
 * Dos usos: la foto de la llegada a una sede (fotoCercana, /campo) y el
 * explorador de entorno del CRUE (fotosAlrededor, click en el mapa). Misma
 * regla que todo el proyecto: sin NEXT_PUBLIC_MAPILLARY_TOKEN (o sin
 * cobertura en esa cuadra) devuelve null/[] y la UI degrada declarándolo.
 */

import type { Coordenada } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN;

/** La UI distingue "sin token" de "sin cobertura" para no mentir. */
export const mapillaryConfigurado = Boolean(TOKEN);

export interface FotoMapillary {
  id: string;
  url: string;
}

/** Foto más cercana a la coordenada dentro de `radioM` metros, o null. */
export async function fotoCercana(
  coord: Coordenada,
  radioM = 120,
): Promise<FotoMapillary | null> {
  if (!TOKEN) return null;

  // bbox en grados: ~111 km por grado. Suficiente a escala de cuadra.
  const d = radioM / 111_000;
  const bbox = [
    coord.lng - d,
    coord.lat - d,
    coord.lng + d,
    coord.lat + d,
  ].join(",");

  try {
    const r = await fetch(
      `https://graph.mapillary.com/images?access_token=${TOKEN}` +
        `&fields=id,thumb_1024_url&bbox=${bbox}&limit=1`,
    );
    if (!r.ok) return null;
    const cuerpo = (await r.json()) as {
      data?: { id: string; thumb_1024_url?: string }[];
    };
    const img = cuerpo.data?.[0];
    return img?.thumb_1024_url ? { id: img.id, url: img.thumb_1024_url } : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────

export interface FotoAlrededor extends FotoMapillary {
  /** Epoch ms de captura — se muestra siempre: la foto tiene fecha, no es "ahora". */
  capturadaEn: number | null;
  coord: Coordenada | null;
  /** Metros aproximados al punto consultado. */
  distanciaM: number | null;
}

/**
 * Las fotos alrededor de un punto, ordenadas por cercanía. Para el
 * explorador del CRUE: "¿cómo se ve este sitio a nivel de calle?".
 */
export async function fotosAlrededor(
  coord: Coordenada,
  radioM = 150,
  limite = 12,
): Promise<FotoAlrededor[]> {
  if (!TOKEN) return [];

  const d = radioM / 111_000;
  const bbox = [
    coord.lng - d,
    coord.lat - d,
    coord.lng + d,
    coord.lat + d,
  ].join(",");

  try {
    const r = await fetch(
      `https://graph.mapillary.com/images?access_token=${TOKEN}` +
        `&fields=id,thumb_1024_url,captured_at,computed_geometry` +
        `&bbox=${bbox}&limit=${limite}`,
    );
    if (!r.ok) return [];
    const cuerpo = (await r.json()) as {
      data?: {
        id: string;
        thumb_1024_url?: string;
        captured_at?: number;
        computed_geometry?: { coordinates?: [number, number] };
      }[];
    };

    const metros = (a: Coordenada, b: Coordenada) => {
      // Equirectangular: de sobra a escala de cuadra.
      const x = (b.lng - a.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
      const y = (b.lat - a.lat) * 111_000;
      return Math.round(Math.hypot(x, y));
    };

    return (cuerpo.data ?? [])
      .filter((img) => img.thumb_1024_url)
      .map((img) => {
        const c = img.computed_geometry?.coordinates;
        const donde = c ? { lng: c[0], lat: c[1] } : null;
        return {
          id: img.id,
          url: img.thumb_1024_url!,
          capturadaEn: img.captured_at ?? null,
          coord: donde,
          distanciaM: donde ? metros(coord, donde) : null,
        };
      })
      .sort(
        (a, b) => (a.distanciaM ?? Infinity) - (b.distanciaM ?? Infinity),
      );
  } catch {
    return [];
  }
}
