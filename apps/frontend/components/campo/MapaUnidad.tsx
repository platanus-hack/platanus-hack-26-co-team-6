"use client";

/**
 * Dónde está la unidad, ahora.
 *
 * El mismo lenguaje visual que el mapa de despacho y el geovisor del CRUE
 * —satélite en penumbra, marcador con anillo latiendo— pero con un solo
 * trabajo: seguir a la ambulancia mientras se mueve.
 *
 * ── POR QUÉ ESTÁ EN LA PANTALLA DE ARRANQUE ───────────────────────
 * Porque responde de un vistazo a la pregunta que la barra solo contesta con
 * palabras: "¿el sistema sabe dónde estoy?". Un `GPS ±12 m` es correcto y no
 * dice nada; ver el punto sobre la calle correcta sí. Y cuando el GPS engancha
 * mal —dentro de un parqueadero, entre edificios— el mapa lo delata antes de
 * que el error se convierta en un ranking calculado desde el sitio equivocado.
 *
 * ── LA CÁMARA NO PERSIGUE SIEMPRE ─────────────────────────────────
 * Recentrar en cada arreglo del GPS haría que el mapa temblara: la precisión
 * oscila unos metros aunque el vehículo esté parado. Solo se mueve cuando la
 * unidad se sale de una zona cómoda del encuadre, y con `easeTo` para que se
 * lea como un desplazamiento y no como un salto.
 */

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Coordenada } from "@/lib/types";
import { ESTILO_MAPA as ESTILO } from "@/components/mapa/paleta";
import type { EstadoGeo } from "@/lib/useGeolocalizacion";

/**
 * A partir de cuántos metros de deriva se recentra la cámara.
 *
 * 250 m es aproximadamente una manzana larga de Bogotá: suficiente para que el
 * jitter del GPS parado no mueva nada, y poco para que en marcha el punto no
 * llegue a tocar el borde.
 */
const DERIVA_MAX_M = 250;

const ZOOM = 15.2;

export default function MapaUnidad({
  posicion,
  estado,
  precisionM,
}: {
  posicion: Coordenada | null;
  estado: EstadoGeo;
  precisionM: number | null;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<mapboxgl.Map | null>(null);
  const marcadorRef = useRef<mapboxgl.Marker | null>(null);
  const [listo, setListo] = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // ── Montaje (una sola vez) ─────────────────────────────────────
  useEffect(() => {
    if (!token || !contenedorRef.current || mapaRef.current) return;

    mapboxgl.accessToken = token;
    const mapa = new mapboxgl.Map({
      container: contenedorRef.current,
      style: ESTILO,
      // Sin arreglo del GPS todavía se centra en Bogotá: un mapa del océano
      // Atlántico (0,0) mientras engancha se lee como que algo se rompió.
      center: posicion ? [posicion.lng, posicion.lat] : [-74.08, 4.61],
      zoom: posicion ? ZOOM : 10.5,
      attributionControl: false,
      // La consola se usa con una mano y el pulgar: un giro accidental deja el
      // norte donde no toca y desorienta más de lo que aporta.
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapa.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    mapa.on("style.load", () => {
      mapa.setConfigProperty("basemap", "lightPreset", "dusk");
      setListo(true);
    });

    mapaRef.current = mapa;

    return () => {
      marcadorRef.current?.remove();
      marcadorRef.current = null;
      mapa.remove();
      mapaRef.current = null;
      setListo(false);
    };
    // Montaje único: el centro inicial usa la posición del primer render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Seguimiento ────────────────────────────────────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo || !posicion) return;

    const destino: [number, number] = [posicion.lng, posicion.lat];

    if (!marcadorRef.current) {
      // Se reutilizan las clases del marcador de origen del mapa de despacho
      // (definidas en globals.css): es la misma cosa —la unidad— y verla
      // distinta en dos pantallas obligaría a aprenderla dos veces.
      const el = document.createElement("div");
      el.className = "mapa-origen";
      el.innerHTML =
        '<span class="mapa-origen-anillo"></span>' +
        '<span class="mapa-origen-anillo mapa-origen-anillo-2"></span>' +
        '<span class="mapa-origen-punto"></span>';
      marcadorRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(destino)
        .addTo(mapa);
      mapa.easeTo({ center: destino, zoom: ZOOM, duration: 900 });
      return;
    }

    marcadorRef.current.setLngLat(destino);

    // Solo se recentra si la unidad se ha ido lejos del centro actual.
    const centro = mapa.getCenter();
    const deriva = centro.distanceTo(new mapboxgl.LngLat(destino[0], destino[1]));
    if (deriva > DERIVA_MAX_M) {
      mapa.easeTo({ center: destino, duration: 1200 });
    }
  }, [listo, posicion]);

  if (!token) {
    return (
      <Marco>
        <p className="text-xs text-[color:var(--color-texto-tenue)]">
          Mapa desactivado — falta NEXT_PUBLIC_MAPBOX_TOKEN
        </p>
      </Marco>
    );
  }

  return (
    <div className="relative h-56 rounded-[1.75rem] overflow-hidden border border-[color:var(--color-borde)]">
      {/* Inline y no `absolute inset-0`: mapbox-gl.css llega después de
          Tailwind en el bundle y su `.mapboxgl-map{position:relative}` pisa la
          clase — el contenedor colapsaba a 0px de alto (mapa negro). */}
      <div ref={contenedorRef} style={{ position: "absolute", inset: 0 }} />

      {/* Viñeta para fundir el satélite con el fondo de la app. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: "inset 0 0 60px 20px var(--color-fondo)",
        }}
      />

      <div className="pointer-events-none absolute left-3 bottom-3 flex items-center gap-1.5">
        <span className="rounded-md bg-[color:var(--color-fondo)]/80 px-2 py-1 text-[11px] backdrop-blur">
          {estado === "ok" ? (
            <>
              Tu unidad{" "}
              <span className="tabular text-[color:var(--color-texto-tenue)]">
                ±{precisionM} m
              </span>
            </>
          ) : estado === "pidiendo" ? (
            "Buscando señal de GPS…"
          ) : (
            "Sin ubicación — se rutea desde el punto de demo"
          )}
        </span>
      </div>
    </div>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-56 rounded-[1.75rem] grid place-items-center text-center p-4
                 bg-[color:var(--color-superficie)]
                 border border-dashed border-[color:var(--color-borde)]"
    >
      {children}
    </div>
  );
}
