/**
 * Geometría de apoyo.
 *
 * Función pura, sin estado y sin dependencias: no merece ser un provider
 * de Nest. La usan SedesService (fallback y pre-filtro) y EtaService.
 */

/** Haversine. Se usa como fallback y para pre-filtrar antes de llamar a Mapbox. */
export function distanciaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
