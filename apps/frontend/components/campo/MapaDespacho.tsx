"use client";

/**
 * MapaDespacho — el mapa de /campo.
 *
 * Mapbox Standard Satellite con preset "dusk": satélite 3D con iluminación
 * de atardecer que funde con --color-fondo. Si en el proyector el satélite
 * compite con las tarjetas, el plan B del spec es dark-v11: cambiar ESTILO.
 *
 * La ruta al destino HOY es un arco decorativo (bezier origen→sede): core ya
 * calcula la ruta real (eta.service.ts#rutaHasta) pero aún no la expone por
 * API. Cuando exista, pasar el LineString por la prop `ruta` y el arco se
 * ignora — el front no llama a Directions por su cuenta (regla de lib/api.ts).
 */

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Candidato, Coordenada } from "@/lib/types";
import {
  colorCongestion,
  ESTILO_MAPA as ESTILO,
  RUTA_ALERTA,
  RUTA_ROSA,
} from "@/components/mapa/paleta";
import { arcoEntre } from "@/components/mapa/geometria";

// Secuencia de guiones para la "corriente" que recorre la ruta (patrón
// documentado de Mapbox para animar line-dasharray sin re-crear la capa).
const SECUENCIA_GUIONES: [number, number, number][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1],
  [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3.5], [0, 1, 3], [0, 1.5, 2.5],
  [0, 2, 2], [0, 2.5, 1.5], [0, 3, 1], [0, 3.5, 0.5],
];

interface Props {
  origen: Coordenada;
  candidatos: Candidato[];
  /** Código de la sede ya despachada; null mientras se elige. */
  sedeSeleccionada: string | null;
  /** Ruta real de core cuando exista el endpoint. Reemplaza al arco. */
  ruta?: GeoJSON.LineString | null;
  /** true → se muestra la píldora "ubicación demo". */
  ubicacionDemo?: boolean;
}

export default function MapaDespacho({
  origen,
  candidatos,
  sedeSeleccionada,
  ruta = null,
  ubicacionDemo = false,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<mapboxgl.Map | null>(null);
  const marcadoresRef = useRef<mapboxgl.Marker[]>([]);
  const marcadorOrigenRef = useRef<mapboxgl.Marker | null>(null);
  const animacionRef = useRef<number>(0);
  const [listo, setListo] = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // La sede a la que se dibuja la ruta: la despachada, o la #1 del ranking.
  const destino =
    candidatos.find((c) => c.sede.codigo === sedeSeleccionada) ??
    candidatos.find((c) => c.rank === 1) ??
    null;

  // ── Montaje (una sola vez) ─────────────────────────────────────
  useEffect(() => {
    if (!token || !contenedorRef.current || mapaRef.current) return;

    const reducirMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    mapboxgl.accessToken = token;
    const mapa = new mapboxgl.Map({
      container: contenedorRef.current,
      style: ESTILO,
      center: [origen.lng, origen.lat],
      zoom: reducirMovimiento ? 14.2 : 11,
      pitch: reducirMovimiento ? 55 : 30,
      bearing: -15,
      attributionControl: false,
    });
    mapa.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    mapa.on("style.load", () => {
      mapa.setConfigProperty("basemap", "lightPreset", "dusk");

      // Glow debajo + línea con gradiente rosa→alerta + corriente animada.
      mapa.addSource("ruta", {
        type: "geojson",
        lineMetrics: true,
        data: { type: "Feature", properties: {}, geometry: arcoEntre(origen, origen) },
      });
      const gradiente: mapboxgl.Expression = [
        "interpolate", ["linear"], ["line-progress"],
        0, RUTA_ROSA,
        1, RUTA_ALERTA,
      ];
      mapa.addLayer({
        id: "ruta-glow",
        type: "line",
        source: "ruta",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 14,
          "line-blur": 8,
          "line-opacity": 0.45,
          "line-gradient": gradiente,
        },
      });
      mapa.addLayer({
        id: "ruta-linea",
        type: "line",
        source: "ruta",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-width": 4.5, "line-gradient": gradiente },
      });
      mapa.addLayer({
        id: "ruta-corriente",
        type: "line",
        source: "ruta",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 2.5,
          "line-color": "#ffffff",
          "line-opacity": 0.9,
          "line-dasharray": [0, 4, 3],
        },
      });

      if (!reducirMovimiento) {
        let paso = 0;
        let ultimo = 0;
        const animar = (ts: number) => {
          if (ts - ultimo > 80) {
            paso = (paso + 1) % SECUENCIA_GUIONES.length;
            if (mapa.getLayer("ruta-corriente")) {
              mapa.setPaintProperty(
                "ruta-corriente",
                "line-dasharray",
                SECUENCIA_GUIONES[paso],
              );
            }
            ultimo = ts;
          }
          animacionRef.current = requestAnimationFrame(animar);
        };
        animacionRef.current = requestAnimationFrame(animar);

        // Intro: caer desde lejos hacia el origen, inclinando la cámara.
        mapa.flyTo({
          center: [origen.lng, origen.lat],
          zoom: 14.2,
          pitch: 55,
          bearing: -15,
          duration: 3000,
          essential: false,
        });
      }

      setListo(true);
    });

    const observador = new ResizeObserver(() => mapa.resize());
    observador.observe(contenedorRef.current);

    mapaRef.current = mapa;
    return () => {
      cancelAnimationFrame(animacionRef.current);
      observador.disconnect();
      marcadoresRef.current.forEach((m) => m.remove());
      marcadoresRef.current = [];
      marcadorOrigenRef.current = null;
      mapa.remove();
      mapaRef.current = null;
      setListo(false);
    };
    // Montaje único: el centro inicial usa el origen del primer render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Marcador de origen (anillo latiendo) ───────────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;
    if (!marcadorOrigenRef.current) {
      const el = document.createElement("div");
      el.className = "mapa-origen";
      el.innerHTML =
        '<span class="mapa-origen-anillo"></span>' +
        '<span class="mapa-origen-anillo mapa-origen-anillo-2"></span>' +
        '<span class="mapa-origen-punto"></span>';
      marcadorOrigenRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([origen.lng, origen.lat])
        .addTo(mapa);
    } else {
      marcadorOrigenRef.current.setLngLat([origen.lng, origen.lat]);
    }
  }, [listo, origen.lng, origen.lat]);

  // ── Pins de sedes (cápsulas por congestión) ────────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;

    marcadoresRef.current.forEach((m) => m.remove());
    marcadoresRef.current = candidatos.map((c) => {
      const el = document.createElement("div");
      const descartada = c.motivoDescarte !== null;
      const esDestino = destino?.sede.codigo === c.sede.codigo;

      if (descartada) {
        el.className = "mapa-pin mapa-pin-descartada";
        el.textContent = "⛔";
      } else {
        el.className = `mapa-pin ${esDestino ? "mapa-pin-destino" : ""}`;
        el.style.background = colorCongestion(c.congestion);
        el.textContent = `#${c.rank} · ${Math.round(c.etaMin)}′`;
      }
      el.title = c.sede.nombre;

      return new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([c.sede.coord.lng, c.sede.coord.lat])
        .addTo(mapa);
    });
  }, [listo, candidatos, destino?.sede.codigo]);

  // ── Ruta al destino ────────────────────────────────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;
    const fuente = mapa.getSource("ruta") as mapboxgl.GeoJSONSource | undefined;
    if (!fuente) return;

    const geometria = destino
      ? (ruta ?? arcoEntre(origen, destino.sede.coord))
      : arcoEntre(origen, origen);
    fuente.setData({ type: "Feature", properties: {}, geometry: geometria });
  }, [listo, destino, ruta, origen.lng, origen.lat]);

  // ── Cámara: encuadrar lo que importa ───────────────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;

    const reducirMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const limites = new mapboxgl.LngLatBounds();
    limites.extend([origen.lng, origen.lat]);

    if (sedeSeleccionada && destino) {
      // Despachada: cerrar el plano sobre la ruta, más drama de cámara.
      limites.extend([destino.sede.coord.lng, destino.sede.coord.lat]);
      mapa.fitBounds(limites, {
        padding: { top: 90, bottom: 60, left: 60, right: 60 },
        pitch: 62,
        bearing: -15,
        maxZoom: 15,
        duration: reducirMovimiento ? 0 : 2600,
      });
      return;
    }

    const viables = candidatos.filter((c) => c.motivoDescarte === null);
    if (viables.length === 0) return;
    viables.forEach((c) => limites.extend([c.sede.coord.lng, c.sede.coord.lat]));
    mapa.fitBounds(limites, {
      padding: { top: 80, bottom: 50, left: 50, right: 50 },
      pitch: 48,
      bearing: -15,
      maxZoom: 14.5,
      duration: reducirMovimiento ? 0 : 2200,
    });
  }, [listo, candidatos, sedeSeleccionada, destino, origen.lng, origen.lat]);

  // ── Render ─────────────────────────────────────────────────────

  if (!token) {
    // Sin token la app no se rompe: la regla es degradar, no morir.
    return (
      <div className="h-72 rounded-[2rem] border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] flex items-center justify-center text-sm text-[color:var(--color-texto-tenue)]">
        Mapa desactivado — falta NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  return (
    <div className="relative h-72 rounded-[2rem] overflow-hidden border border-[color:var(--color-borde)]">
      <div ref={contenedorRef} className="absolute inset-0" />

      {/* Viñeta para fundir el satélite con el fondo de la app. */}
      <div
        className="absolute inset-0 pointer-events-none rounded-[2rem]"
        style={{ boxShadow: "inset 0 0 46px 14px rgba(10,14,20,0.55)" }}
      />

      {ubicacionDemo && (
        <span className="absolute top-3 right-3 px-3 py-1 rounded-full text-[11px] bg-neutral-900/70 backdrop-blur-lg text-[color:var(--color-texto-tenue)] border border-[color:var(--color-borde)]">
          ubicación demo
        </span>
      )}

      <style>{`
        .mapa-origen {
          position: relative;
          width: 22px;
          height: 22px;
        }
        .mapa-origen-punto {
          position: absolute;
          inset: 5px;
          border-radius: 9999px;
          background: #ff3b47;
          border: 2px solid #fff;
          box-shadow: 0 0 10px rgba(255, 59, 71, 0.9);
        }
        .mapa-origen-anillo {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          border: 2px solid rgba(255, 59, 71, 0.85);
          animation: mapa-latido-anillo 2s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .mapa-origen-anillo-2 { animation-delay: 1s; }
        @keyframes mapa-latido-anillo {
          0% { transform: scale(0.55); opacity: 0.9; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .mapa-pin {
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: #04121f;
          border: 1.5px solid rgba(255, 255, 255, 0.85);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
          white-space: nowrap;
          cursor: default;
        }
        .mapa-pin-destino {
          font-size: 13px;
          padding: 6px 14px;
          border-width: 2px;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25), 0 3px 14px rgba(0, 0, 0, 0.55);
        }
        .mapa-pin-descartada {
          background: #2a3543;
          color: #8b9bb0;
          border-color: rgba(139, 155, 176, 0.4);
          font-size: 10px;
          padding: 2px 7px;
          opacity: 0.85;
        }
        @media (prefers-reduced-motion: reduce) {
          .mapa-origen-anillo { animation: none; opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
