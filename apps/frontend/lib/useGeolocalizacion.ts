"use client";

/**
 * Dónde está la ambulancia, de verdad.
 *
 * Hasta ahora `/campo` no mandaba `origen` y core caía a `ORIGEN_DEMO` — un
 * punto fijo en el centro de Bogotá. Con eso el ranking sale igual salgas de
 * donde salgas, que es exactamente lo contrario de lo que hace el producto.
 *
 * ⚠️ LA VALIDACIÓN DE BOGOTÁ NO SOBRA.
 *    El navegador geolocaliza por IP cuando no hay GPS. En el wifi del evento,
 *    con VPN, o en un portátil, eso puede dar un punto en otra ciudad o en
 *    otro país. Rutear desde ahí no falla: devuelve un ranking vacío o
 *    absurdo, sin un solo error en pantalla. Preferimos detectarlo y decirlo.
 *
 * Sin permiso, sin GPS o fuera de Bogotá devuelve `null`, y quien llame manda
 * `origen: undefined` para que core use su propio default. El flujo nunca se
 * rompe por esto.
 */

import { useCallback, useEffect, useState } from "react";
import type { Coordenada } from "./types";

export type EstadoGeo =
  | "pidiendo"
  | "ok"
  | "denegado"
  | "no-soportado"
  | "fuera-de-bogota"
  | "error";

/** Caja generosa alrededor de Bogotá. La misma que usa el pipeline de datos. */
const BOGOTA = { latMin: 3.9, latMax: 5.1, lngMin: -75.0, lngMax: -73.5 };

const enBogota = ({ lat, lng }: Coordenada) =>
  lat > BOGOTA.latMin && lat < BOGOTA.latMax && lng > BOGOTA.lngMin && lng < BOGOTA.lngMax;

/**
 * Va en una ambulancia en movimiento: GPS real, y una posición de hace más de
 * un minuto ya no sirve para calcular una ruta.
 */
const OPCIONES: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
};

export const MENSAJE_GEO: Record<EstadoGeo, string> = {
  pidiendo: "Ubicando la unidad…",
  ok: "Ubicación de la unidad",
  denegado: "Sin permiso de ubicación — se rutea desde el punto de demo",
  "no-soportado": "Este navegador no da ubicación — se rutea desde el punto de demo",
  "fuera-de-bogota": "La ubicación cae fuera de Bogotá — se rutea desde el punto de demo",
  error: "No se pudo ubicar la unidad — se rutea desde el punto de demo",
};

export function useGeolocalizacion() {
  const [origen, setOrigen] = useState<Coordenada | null>(null);
  const [precisionM, setPrecisionM] = useState<number | null>(null);

  // Arranca en "pidiendo" y no en un estado neutro porque el efecto de montaje
  // pide la ubicación de una vez. Es una constante, no algo derivado de
  // `navigator`: derivarlo durante el render daría "no-soportado" en el
  // prerender del servidor y "pidiendo" en el cliente — mismatch de hidratación.
  const [estado, setEstado] = useState<EstadoGeo>("pidiendo");

  const alUbicar = useCallback((pos: GeolocationPosition) => {
    const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (!enBogota(c)) {
      setOrigen(null);
      setEstado("fuera-de-bogota");
      return;
    }
    setOrigen(c);
    setPrecisionM(Math.round(pos.coords.accuracy));
    setEstado("ok");
  }, []);

  const alFallar = useCallback((err: GeolocationPositionError) => {
    setOrigen(null);
    setEstado(err.code === err.PERMISSION_DENIED ? "denegado" : "error");
  }, []);

  /** Reintento manual. En una ambulancia el GPS engancha tarde. */
  const ubicar = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado("no-soportado");
      return;
    }
    setEstado("pidiendo");
    navigator.geolocation.getCurrentPosition(alUbicar, alFallar, OPCIONES);
  }, [alUbicar, alFallar]);

  // Se pide al montar: el paramédico abre la app para usarla, no para
  // configurarla, y el GPS tarda segundos en enganchar.
  //
  // El efecto NO llama a `ubicar()`: esa función arranca poniendo el estado en
  // "pidiendo", y un setState síncrono dentro de un efecto encadena renders.
  // Aquí el estado ya ES "pidiendo", así que solo hay que disparar la llamada
  // al navegador y dejar que sus callbacks —asíncronos— resuelvan.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // Un navegador sin geolocalización no tiene forma de avisarnos por
      // callback, así que la salida se reporta por el mismo camino asíncrono
      // que usaría un fallo real de GPS. No es para callar al linter: un
      // setState síncrono aquí encadenaría un render extra en cada montaje.
      queueMicrotask(() => setEstado("no-soportado"));
      return;
    }
    navigator.geolocation.getCurrentPosition(alUbicar, alFallar, OPCIONES);
  }, [alUbicar, alFallar]);

  return { origen, estado, precisionM, ubicar };
}
