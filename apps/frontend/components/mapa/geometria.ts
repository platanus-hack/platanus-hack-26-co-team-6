import type { Coordenada } from "@/lib/types";

/**
 * Arco bezier entre dos puntos. Es decorativo: la ruta real la calcula core
 * (eta.service.ts#rutaHasta) y aún no está expuesta por API. Cuando lo esté,
 * los mapas pintan ese LineString y este arco queda solo como fallback.
 */
export function arcoEntre(a: Coordenada, b: Coordenada): GeoJSON.LineString {
  const cx = (a.lng + b.lng) / 2 - (b.lat - a.lat) * 0.18;
  const cy = (a.lat + b.lat) / 2 + (b.lng - a.lng) * 0.18;
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const u = 1 - t;
    coordinates.push([
      u * u * a.lng + 2 * u * t * cx + t * t * b.lng,
      u * u * a.lat + 2 * u * t * cy + t * t * b.lat,
    ]);
  }
  return { type: "LineString", coordinates };
}

/**
 * Distancia en línea recta, en km (haversine).
 *
 * Para rotular "a 3.2 km de tu posición" en el detalle de un caso. Es aire,
 * no calle: la distancia por vía la calcula core con Mapbox y aquí no se
 * finge — quien la pinte debe decir "en línea recta".
 */
export function kmEntre(a: Coordenada, b: Coordenada): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
