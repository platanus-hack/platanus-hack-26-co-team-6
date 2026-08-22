/**
 * Paleta de los mapas (campo y crue).
 *
 * El paint de Mapbox no lee variables CSS, así que los acentos van en hex:
 * el semáforo replica los tokens de Sebas y la ruta usa los acentos Pulsewave.
 */

export const ESTILO_MAPA = "mapbox://styles/mapbox/standard-satellite";

export const RUTA_ROSA = "#FF73A6";
export const RUTA_ALERTA = "#FF8026";

/** Semáforo de congestión — mismos umbrales que las barras de las tarjetas. */
export function colorCongestion(indice: number): string {
  if (indice > 0.85) return "#ff3b47";
  if (indice > 0.7) return "#ff9f1c";
  return "#2ec4a6";
}
