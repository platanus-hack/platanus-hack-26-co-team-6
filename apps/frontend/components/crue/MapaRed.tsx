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
import type { Coordenada, CongestionSede, Handshake } from "@/lib/types";
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
  /** Click en el pin de una sede (abre su ficha). */
  onSede?: (codigo: string) => void;
  /** Click en el pin de un caso (abre su panel). */
  onCaso?: (casoId: string) => void;
  /** Centrar el mapa aquí (ej. "Ver en el mapa" de la ficha). */
  foco?: Coordenada | null;
  /** Click en un punto vacío del mapa (explorar el sitio a nivel de calle). */
  onLugar?: (coord: Coordenada) => void;
  /** Punto en exploración: se marca con un anillo blanco; null lo quita. */
  lugar?: Coordenada | null;
  /**
   * true → lienzo: llena a su contenedor (sin cápsula, sin viñeta) y la
   * leyenda va centrada abajo. Es el modo consola-geovisor de /crue.
   */
  pantallaCompleta?: boolean;
  /**
   * Padding del encuadre inicial, para que los pins no queden debajo de las
   * cards flotantes (cola a la izquierda, red a la derecha, KPIs arriba).
   */
  margenes?: { top: number; bottom: number; left: number; right: number };
}

export default function MapaRed({
  congestion,
  casos,
  handshakes,
  onSede,
  onCaso,
  foco = null,
  onLugar,
  lugar = null,
  pantallaCompleta = false,
  margenes,
}: Props) {
  // Los pins se crean una vez y viven entre renders: el handler real del
  // click se lee de un ref para que siempre apunte al closure más reciente.
  const onSedeRef = useRef(onSede);
  onSedeRef.current = onSede;
  const onCasoRef = useRef(onCaso);
  onCasoRef.current = onCaso;
  const onLugarRef = useRef(onLugar);
  onLugarRef.current = onLugar;
  const pinLugarRef = useRef<mapboxgl.Marker | null>(null);
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

    // Click en un punto vacío del mapa → explorar el sitio. Los pins hacen
    // stopPropagation en su propio click, así que aquí no llegan.
    mapa.on("click", (e) => {
      onLugarRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
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
        // Cruz blanca sobre círculo de color: el símbolo cartográfico de
        // centro de salud (no emoji). El color lo pone la congestión abajo.
        el.innerHTML =
          '<span class="red-sede-punto">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>' +
          "</span>";
        const codigo = s.codigo;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSedeRef.current?.(codigo);
        });
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
      // Un padding mayor que el lienzo hace throw en fitBounds: si las cards
      // no caben (pantalla chica), se encuadra con margen plano.
      const lienzo = mapa.getContainer();
      const m = margenes ?? { top: 70, bottom: 70, left: 70, right: 70 };
      const caben =
        lienzo.clientWidth > m.left + m.right + 120 &&
        lienzo.clientHeight > m.top + m.bottom + 120;
      mapa.fitBounds(limites, {
        padding: caben ? m : 40,
        pitch: 45,
        bearing: mapa.getBearing(),
        maxZoom: 13,
        duration: reducirMovimiento ? 0 : 2400,
      });
    }
    // margenes solo afecta el encuadre inicial; no re-encuadra al cambiar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const casoId = c.id;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onCasoRef.current?.(casoId);
        });
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

  // ── Foco pedido desde afuera ("Ver en el mapa") ────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo || !foco) return;
    mapa.flyTo({ center: [foco.lng, foco.lat], zoom: 14, duration: 1600 });
  }, [listo, foco]);

  // ── Marcador del punto en exploración (vista de calle) ─────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;
    if (!lugar) {
      pinLugarRef.current?.remove();
      pinLugarRef.current = null;
      return;
    }
    if (!pinLugarRef.current) {
      const el = document.createElement("div");
      el.className = "red-lugar";
      pinLugarRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([lugar.lng, lugar.lat])
        .addTo(mapa);
    } else {
      pinLugarRef.current.setLngLat([lugar.lng, lugar.lat]);
    }
  }, [listo, lugar]);

  // ── Render ─────────────────────────────────────────────────────

  if (!token) {
    return (
      <div
        className={`${
          pantallaCompleta ? "h-full w-full" : "h-[380px] rounded-[2rem] border border-[color:var(--color-borde)]"
        } bg-[color:var(--color-superficie)] flex items-center justify-center text-sm text-[color:var(--color-texto-tenue)]`}
      >
        Mapa desactivado — falta NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  const sinCoordenadas = listo && congestion.length > 0 && !congestion.some((s) => s.coord);

  return (
    <div
      className={
        pantallaCompleta
          ? "relative h-full w-full"
          : "relative h-[380px] rounded-[2rem] overflow-hidden border border-[color:var(--color-borde)]"
      }
    >
      {/* Inline y no `absolute inset-0`: mapbox-gl.css llega después de
          Tailwind en el bundle y su `.mapboxgl-map{position:relative}` pisa
          la clase — el contenedor colapsaba a 0px de alto (mapa negro). */}
      <div ref={contenedorRef} style={{ position: "absolute", inset: 0 }} />

      {/* Viñeta que funde el satélite con el fondo (solo en cápsula: en el
          modo lienzo el mapa ES el fondo y la viñeta se sentiría sucia). */}
      {!pantallaCompleta && (
        <div
          className="absolute inset-0 pointer-events-none rounded-[2rem]"
          style={{ boxShadow: "inset 0 0 52px 16px rgba(10,14,20,0.55)" }}
        />
      )}

      {/* Leyenda + avisos: centrados abajo en modo lienzo. */}
      <div
        className={`absolute bottom-3 flex flex-col items-center gap-2 ${
          pantallaCompleta ? "left-1/2 -translate-x-1/2" : "left-3 items-start"
        }`}
      >
        {sinCoordenadas && (
          <span className="px-3 py-1 rounded-full text-[11px] bg-neutral-900/75 backdrop-blur-lg text-[color:var(--color-texto-tenue)] border border-[color:var(--color-borde)] whitespace-nowrap">
            core sin coordenadas — reinicia core para ver las sedes
          </span>
        )}
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-full text-[11px] bg-neutral-900/75 backdrop-blur-lg border border-[color:var(--color-borde)] text-[color:var(--color-texto-tenue)] whitespace-nowrap">
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
      </div>

      <style>{`
        .red-sede {
          width: 26px;
          height: 26px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .red-caso { cursor: pointer; }
        .red-lugar {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          border: 2.5px solid #fff;
          background: rgba(255, 255, 255, 0.25);
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.7);
        }
        .red-sede-punto {
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          display: grid;
          place-items: center;
          border: 1.5px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
          transition: background 0.6s ease, transform 0.2s ease;
        }
        .red-sede-punto svg {
          width: 12px;
          height: 12px;
          fill: #fff;
        }
        .red-sede:hover .red-sede-punto {
          transform: scale(1.15);
        }
        .red-sede-critica {
          animation: red-latido-punto 1.4s ease-in-out infinite;
          box-shadow: 0 0 14px rgba(255, 59, 71, 0.85);
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
