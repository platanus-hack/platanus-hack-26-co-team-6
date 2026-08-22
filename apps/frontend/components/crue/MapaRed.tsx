"use client";

/**
 * MapaRed — el mapa de sala del CRUE.
 *
 * La red completa de un vistazo: cada sede es un punto coloreado por su
 * índice de congestión inferido, los casos activos laten en rojo, y cada
 * despacho en curso se dibuja como un arco (punteado mientras espera
 * respuesta, con gradiente cuando la sede aceptó).
 *
 * Recibe lo mismo que ya trae el polling de /estado — no pide nada extra.
 * Las coordenadas de sede llegan en CongestionSede.coord (campo opcional
 * nuevo): si core aún no lo manda, el mapa degrada a mostrar solo casos.
 */

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { CongestionSede, Handshake } from "@/lib/types";
import type { CasoConsola } from "./derivados";
import {
  colorCongestion,
  ESTILO_MAPA,
  RUTA_ALERTA,
  RUTA_ROSA,
} from "@/components/mapa/paleta";
import { arcoEntre } from "@/components/mapa/geometria";

interface Props {
  congestion: CongestionSede[];
  casos: CasoConsola[];
  handshakes: Handshake[];
}

export default function MapaRed({ congestion, casos, handshakes }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<mapboxgl.Map | null>(null);
  // Marcadores keyed para actualizar en sitio: el polling llega cada 2.5s y
  // recrearlos reiniciaría las animaciones CSS (parpadeo visible).
  const pinsSedesRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const pinsCasosRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const animacionRef = useRef<number>(0);
  const encuadradoRef = useRef(false);
  const [listo, setListo] = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // ── Montaje (una sola vez) ─────────────────────────────────────
  useEffect(() => {
    if (!token || !contenedorRef.current || mapaRef.current) return;

    const reducirMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    mapboxgl.accessToken = token;
    const mapa = new mapboxgl.Map({
      container: contenedorRef.current,
      style: ESTILO_MAPA,
      // Bogotá; el primer fitBounds con datos reales corrige el encuadre.
      center: [-74.08, 4.65],
      zoom: 10.8,
      pitch: 45,
      bearing: -15,
      attributionControl: false,
    });
    mapa.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    mapa.on("style.load", () => {
      mapa.setConfigProperty("basemap", "lightPreset", "dusk");

      const gradiente: mapboxgl.Expression = [
        "interpolate", ["linear"], ["line-progress"],
        0, RUTA_ROSA,
        1, RUTA_ALERTA,
      ];
      // Despachos aceptados: arco con glow + gradiente.
      mapa.addSource("vinculos-aceptados", {
        type: "geojson",
        lineMetrics: true,
        data: { type: "FeatureCollection", features: [] },
      });
      mapa.addLayer({
        id: "vinculos-glow",
        type: "line",
        source: "vinculos-aceptados",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 10,
          "line-blur": 6,
          "line-opacity": 0.4,
          "line-gradient": gradiente,
        },
      });
      mapa.addLayer({
        id: "vinculos-linea",
        type: "line",
        source: "vinculos-aceptados",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-width": 3, "line-gradient": gradiente },
      });
      // Despachos esperando respuesta: punteado blanco.
      mapa.addSource("vinculos-pendientes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      mapa.addLayer({
        id: "vinculos-pendientes-linea",
        type: "line",
        source: "vinculos-pendientes",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 2,
          "line-color": "#ffffff",
          "line-opacity": 0.7,
          "line-dasharray": [1.5, 2.5],
        },
      });

      setListo(true);
    });

    // Rotación lenta de tablero de sala; para en cuanto alguien interactúa.
    if (!reducirMovimiento) {
      let detenida = false;
      const detener = () => {
        detenida = true;
        cancelAnimationFrame(animacionRef.current);
      };
      mapa.once("mousedown", detener);
      mapa.once("touchstart", detener);
      mapa.once("wheel", detener);
      let anterior = 0;
      const girar = (ts: number) => {
        if (detenida) return;
        if (anterior !== 0 && !mapa.isMoving()) {
          mapa.setBearing(mapa.getBearing() + (ts - anterior) * 0.0009);
        }
        anterior = ts;
        animacionRef.current = requestAnimationFrame(girar);
      };
      animacionRef.current = requestAnimationFrame(girar);
    }

    const observador = new ResizeObserver(() => mapa.resize());
    observador.observe(contenedorRef.current);

    mapaRef.current = mapa;
    return () => {
      cancelAnimationFrame(animacionRef.current);
      observador.disconnect();
      pinsSedesRef.current.forEach((m) => m.remove());
      pinsSedesRef.current.clear();
      pinsCasosRef.current.forEach((m) => m.remove());
      pinsCasosRef.current.clear();
      mapa.remove();
      mapaRef.current = null;
      encuadradoRef.current = false;
      setListo(false);
    };
  }, [token]);

  // ── Pins de sedes por congestión (actualización en sitio) ──────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;

    const vigentes = new Set<string>();
    for (const s of congestion) {
      if (!s.coord) continue;
      vigentes.add(s.codigo);

      let pin = pinsSedesRef.current.get(s.codigo);
      if (!pin) {
        const el = document.createElement("div");
        el.className = "red-sede";
        el.innerHTML = '<span class="red-sede-punto"></span>';
        pin = new mapboxgl.Marker({ element: el })
          .setLngLat([s.coord.lng, s.coord.lat])
          .addTo(mapa);
        pinsSedesRef.current.set(s.codigo, pin);
      }
      const punto = pin.getElement().querySelector<HTMLElement>(".red-sede-punto");
      if (punto) {
        punto.style.background = colorCongestion(s.indice);
        punto.classList.toggle("red-sede-critica", s.indice > 0.85);
      }
      pin.getElement().title =
        `${s.nombre} · congestión ${Math.round(s.indice * 100)}%`;
    }
    for (const [codigo, pin] of pinsSedesRef.current) {
      if (!vigentes.has(codigo)) {
        pin.remove();
        pinsSedesRef.current.delete(codigo);
      }
    }

    // Un solo encuadre inicial: el tablero no puede saltar en cada polling.
    if (!encuadradoRef.current && vigentes.size > 0) {
      encuadradoRef.current = true;
      const limites = new mapboxgl.LngLatBounds();
      congestion.forEach((s) => s.coord && limites.extend([s.coord.lng, s.coord.lat]));
      const reducirMovimiento = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      mapa.fitBounds(limites, {
        padding: 70,
        pitch: 45,
        bearing: mapa.getBearing(),
        maxZoom: 13,
        duration: reducirMovimiento ? 0 : 2400,
      });
    }
  }, [listo, congestion]);

  // ── Casos activos (origen latiendo en rojo) ────────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;

    const vigentes = new Set<string>();
    for (const c of casos) {
      // /estado ya no expone el origen del paciente; sin coordenada no hay pin.
      if (!c.origen) continue;
      vigentes.add(c.id);
      let pin = pinsCasosRef.current.get(c.id);
      if (!pin) {
        const el = document.createElement("div");
        el.className = "red-caso";
        el.innerHTML =
          '<span class="red-caso-anillo"></span>' +
          '<span class="red-caso-punto"></span>';
        pin = new mapboxgl.Marker({ element: el })
          .setLngLat([c.origen.lng, c.origen.lat])
          .addTo(mapa);
        pinsCasosRef.current.set(c.id, pin);
      }
      pin.getElement().title = c.resumen;
    }
    for (const [id, pin] of pinsCasosRef.current) {
      if (!vigentes.has(id)) {
        pin.remove();
        pinsCasosRef.current.delete(id);
      }
    }
  }, [listo, casos]);

  // ── Arcos de despacho (caso → sede) ────────────────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;

    const coordSede = new Map(
      congestion.filter((s) => s.coord).map((s) => [s.codigo, s.coord!]),
    );
    const origenCaso = new Map(casos.map((c) => [c.id, c.origen]));

    const rasgo = (h: Handshake): GeoJSON.Feature | null => {
      const origen = origenCaso.get(h.casoId);
      const destino = coordSede.get(h.sedeCodigo);
      if (!origen || !destino) return null;
      return { type: "Feature", properties: {}, geometry: arcoEntre(origen, destino) };
    };
    const coleccion = (estado: Handshake["estado"]): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: handshakes
        .filter((h) => h.estado === estado)
        .map(rasgo)
        .filter((f): f is GeoJSON.Feature => f !== null),
    });

    (mapa.getSource("vinculos-aceptados") as mapboxgl.GeoJSONSource | undefined)
      ?.setData(coleccion("aceptado"));
    (mapa.getSource("vinculos-pendientes") as mapboxgl.GeoJSONSource | undefined)
      ?.setData(coleccion("enviado"));
  }, [listo, congestion, casos, handshakes]);

  // ── Render ─────────────────────────────────────────────────────

  if (!token) {
    return (
      <div className="h-[380px] rounded-[2rem] border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] flex items-center justify-center text-sm text-[color:var(--color-texto-tenue)]">
        Mapa desactivado — falta NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  const sinCoordenadas = listo && congestion.length > 0 && !congestion.some((s) => s.coord);

  return (
    <div className="relative h-[380px] rounded-[2rem] overflow-hidden border border-[color:var(--color-borde)]">
      <div ref={contenedorRef} className="absolute inset-0" />

      <div
        className="absolute inset-0 pointer-events-none rounded-[2rem]"
        style={{ boxShadow: "inset 0 0 52px 16px rgba(10,14,20,0.55)" }}
      />

      {/* Leyenda del semáforo, en píldora glass. */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 rounded-full text-[11px] bg-neutral-900/70 backdrop-blur-lg border border-[color:var(--color-borde)] text-[color:var(--color-texto-tenue)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#2ec4a6" }} />
          libre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#ff9f1c" }} />
          congestionada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#ff3b47" }} />
          crítica
        </span>
      </div>

      {sinCoordenadas && (
        <span className="absolute top-3 right-3 px-3 py-1 rounded-full text-[11px] bg-neutral-900/70 backdrop-blur-lg text-[color:var(--color-texto-tenue)] border border-[color:var(--color-borde)]">
          core sin coordenadas — reinicia core para ver las sedes
        </span>
      )}

      <style>{`
        .red-sede {
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
        }
        .red-sede-punto {
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          border: 1.5px solid rgba(255, 255, 255, 0.85);
          box-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
          transition: background 0.6s ease;
        }
        .red-sede-critica {
          width: 16px;
          height: 16px;
          animation: red-latido-punto 1.4s ease-in-out infinite;
          box-shadow: 0 0 12px rgba(255, 59, 71, 0.8);
        }
        @keyframes red-latido-punto {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        .red-caso {
          position: relative;
          width: 20px;
          height: 20px;
        }
        .red-caso-punto {
          position: absolute;
          inset: 5px;
          border-radius: 9999px;
          background: #ff3b47;
          border: 2px solid #fff;
          box-shadow: 0 0 10px rgba(255, 59, 71, 0.9);
        }
        .red-caso-anillo {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          border: 2px solid rgba(255, 59, 71, 0.85);
          animation: red-latido-anillo 2s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        @keyframes red-latido-anillo {
          0% { transform: scale(0.55); opacity: 0.9; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .red-caso-anillo, .red-sede-critica { animation: none; }
        }
      `}</style>
    </div>
  );
}
