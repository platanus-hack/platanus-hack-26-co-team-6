"use client";

/**
 * MapaCobertura — la flota de la ciudad, vista desde la sala del CRUE.
 *
 * Mismo lenguaje visual que `MapaRed.tsx` (satélite `standard-satellite` en
 * `lightPreset: dusk`, pins glass, leyenda flotante abajo): es el mismo
 * regulador mirando la misma ciudad en la pantalla de al lado.
 *
 * Cada móvil se pinta por TIPO (TAB / TAM / sin verificar) y por ESTADO
 * (libre / ocupado), y —esto es lo que lo hace honesto— con el RADIO DE ERROR
 * de su GPS dibujado alrededor.
 *
 * ── LA TRAMPA QUE ESTE MAPA NO PISA ───────────────────────────────
 * La geolocalización del navegador en interiores se equivoca por cientos de
 * metros. Un punto de 12 px sobre una calle concreta afirma una precisión que
 * el dato no tiene, y un regulador que confía en esa afirmación toma una
 * decisión sobre una ambulancia que está a tres cuadras. Por eso el círculo de
 * `coords.accuracy` no es un adorno opcional: es la única parte del pin que
 * dice la verdad sobre cuánto sabemos.
 *
 * ── EL LÍMITE ─────────────────────────────────────────────────────
 * PULSO le MUESTRA la cobertura al CRUE; no asigna móviles. Reposicionar
 * ambulancias es función legal del CRUE (Res. 1220/2010). Este componente no
 * tiene —y no debe tener— ni un control que mueva una unidad.
 */

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Coordenada } from "@/lib/types";
import { ESTILO_MAPA, RUTA_ROSA } from "@/components/mapa/paleta";
import { recorrido as pedirRecorrido } from "@/lib/api-moviles";
import {
  antiguedadS,
  frescuraDe,
  textoAntiguedad,
  textoPrecision,
  type Frescura,
  type MovilCobertura,
} from "@/lib/posicion-modelo";

/**
 * Convierte los puntos de `GET /moviles/:id/recorrido` en tramos LineString.
 *
 * Un tramo por par de puntos, y no un solo LineString, porque cada tramo lleva
 * su propia `t` (0 = el más viejo, 1 = el más reciente) y con ella la capa
 * interpola la opacidad. Mapbox sabe hacer degradados sobre una línea entera
 * con `line-gradient`, pero eso exige `lineMetrics: true` en la fuente y
 * recalcular la geometría completa en cada poll; por tramos el degradado sale
 * igual y la fuente se actualiza sin tocar su configuración.
 *
 * Con menos de dos puntos devuelve vacío: una "línea" de un punto no es un
 * recorrido, es un pin que ya está pintado.
 */
function tramosDeRecorrido(
  puntos: readonly { lat: number; lng: number }[],
): GeoJSON.Feature[] {
  if (puntos.length < 2) return [];
  const tramos: GeoJSON.Feature[] = [];
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i];
    const b = puntos[i + 1];
    tramos.push({
      type: "Feature",
      properties: { t: i / (puntos.length - 1) },
      geometry: {
        type: "LineString",
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
      },
    });
  }
  return tramos;
}

interface Props {
  moviles: MovilCobertura[];
  /** Reloj de la consola. null antes de montar (evita el desajuste de hidratación). */
  ahora: number | null;
  /** Click en un pin. Abre el detalle del móvil en el panel lateral. */
  onMovil?: (id: string) => void;
  /** Centrar el mapa aquí ("Ver en el mapa" desde la lista por localidad). */
  foco?: Coordenada | null;
  /**
   * Móvil cuyo recorrido se dibuja. `null` = ninguno, y el mapa queda limpio.
   *
   * Se pinta UNO y no todos a propósito: con 40 ambulancias, cuarenta
   * polilíneas sobre la ciudad son una maraña donde no se distingue ninguna.
   * El CRUE elige a quién le sigue el rastro.
   */
  movilEnfocado?: string | null;
}

/** Libre y ocupado con los mismos tokens que el resto de las consolas. */
const COLOR_LIBRE = "#2ec4a6";
const COLOR_OCUPADO = "#ff9f1c";
/** Sin reporte reciente: gris. No es un estado clínico, es falta de dato. */
const COLOR_SIN_DATO = "#8b9bb0";

function colorDe(m: MovilCobertura, frescura: Frescura): string {
  if (frescura === "ultima-conocida") return COLOR_SIN_DATO;
  return m.disponible ? COLOR_LIBRE : COLOR_OCUPADO;
}

/** "TAB", "TAM" o "?" — un tipo sin verificar no se pinta como si lo estuviera. */
function etiquetaTipo(m: MovilCobertura): string {
  return m.tipo ?? "?";
}

export default function MapaCobertura({
  moviles,
  ahora,
  onMovil,
  foco = null,
  movilEnfocado = null,
}: Props) {
  // El handler real se lee de un ref: los pins se crean una vez y viven entre
  // renders, así que su listener tiene que apuntar siempre al closure actual.
  // Se escribe en un efecto —y no durante el render— porque tocar un ref
  // mientras React pinta es justo lo que React desaconseja.
  const onMovilRef = useRef(onMovil);
  useEffect(() => {
    onMovilRef.current = onMovil;
  }, [onMovil]);

  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<mapboxgl.Map | null>(null);
  // Marcadores keyed: el polling llega cada pocos segundos y recrearlos
  // reiniciaría la animación (parpadeo) y perdería el hover del regulador.
  const pinsRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const encuadradoRef = useRef(false);
  const [listo, setListo] = useState(false);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // ── Montaje (una sola vez) ─────────────────────────────────────
  useEffect(() => {
    if (!token || !contenedorRef.current || mapaRef.current) return;

    mapboxgl.accessToken = token;
    const mapa = new mapboxgl.Map({
      container: contenedorRef.current,
      style: ESTILO_MAPA,
      center: [-74.08, 4.65],
      zoom: 10.6,
      attributionControl: false,
      // Sin pitch: esto es un mapa de conteo por zona, no un tablero de sala.
      // La perspectiva haría que dos móviles en la misma localidad se vieran a
      // distancias distintas de la cámara y por tanto de tamaños distintos.
      pitch: 0,
    });
    mapa.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    mapa.on("style.load", () => {
      mapa.setConfigProperty("basemap", "lightPreset", "dusk");

      // ── El radio de error del GPS ───────────────────────────────
      // `circle-radius` se da en píxeles, así que se convierte metros → píxeles
      // con la escala del Web Mercator: a zoom 20 y en la latitud de Bogotá un
      // píxel son ~0.149 m, y la interpolación exponencial base 2 mantiene la
      // equivalencia en todos los zooms. Sin esto el círculo mediría lo mismo
      // en toda la ciudad y no significaría nada.
      // ── El recorrido del móvil enfocado ─────────────────────────
      // Va ANTES del radio de error a propósito: Mapbox pinta en orden de
      // adición dentro del mismo slot, y la línea tiene que quedar DEBAJO del
      // círculo de precisión y del pin. Si se pintara encima, la traza taparía
      // justo el dato que el CRUE mira primero — dónde está ahora.
      //
      // Dos capas sobre la misma fuente: un halo oscuro ancho y la línea
      // encima. Sobre satélite en `dusk`, una línea de un solo color se pierde
      // en los tejados claros del centro y en el verde de los cerros; el halo
      // la hace legible en las dos sin subir la opacidad hasta tapar la ciudad.
      mapa.addSource("recorrido", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      mapa.addLayer({
        id: "recorrido-halo",
        type: "line",
        source: "recorrido",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#0B0F14",
          "line-opacity": 0.55,
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            10, 4,
            16, 9,
          ],
        },
      });
      mapa.addLayer({
        id: "recorrido-linea",
        type: "line",
        source: "recorrido",
        slot: "middle",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": RUTA_ROSA,
          // Se desvanece hacia el pasado: el tramo viejo del turno importa
          // menos que el minuto anterior, y un degradado lo dice sin leyenda.
          // `line-gradient` exige `lineMetrics` en la fuente… que no lo tiene,
          // así que el degradado se hace por tramo con la propiedad `t` que
          // calcula `tramosDeRecorrido`.
          "line-opacity": ["interpolate", ["linear"], ["get", "t"], 0, 0.25, 1, 0.95],
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            10, 2,
            16, 5,
          ],
        },
      });

      mapa.addSource("precision-gps", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      mapa.addLayer({
        id: "precision-gps-area",
        type: "circle",
        source: "precision-gps",
        slot: "middle",
        paint: {
          "circle-radius": [
            "interpolate",
            ["exponential", 2],
            ["zoom"],
            0, ["/", ["get", "precisionM"], 156543.03392],
            20, ["/", ["get", "precisionM"], 0.14929],
          ],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.12,
          "circle-stroke-width": 1,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-opacity": 0.35,
        },
      });

      setListo(true);
    });

    const observador = new ResizeObserver(() => mapa.resize());
    observador.observe(contenedorRef.current);

    mapaRef.current = mapa;
    // Copia local para la limpieza: el ref puede apuntar a otra cosa cuando
    // esta función corra.
    const pins = pinsRef.current;
    return () => {
      observador.disconnect();
      pins.forEach((m) => m.remove());
      pins.clear();
      mapa.remove();
      mapaRef.current = null;
      encuadradoRef.current = false;
      setListo(false);
    };
  }, [token]);

  // ── Pins y círculos de precisión ───────────────────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;

    const reloj = ahora ?? Date.now();
    const vigentes = new Set<string>();
    const areas: GeoJSON.Feature[] = [];

    for (const m of moviles) {
      // Sin posición no hay pin. NO se inventa uno en el centro de la ciudad:
      // la lista de al lado lo cuenta como "sin reporte", que es la verdad.
      if (!m.posicion) continue;
      vigentes.add(m.id);

      const segundos = antiguedadS(m.posicion.reportadoEn, reloj);
      const frescura = frescuraDe(segundos);
      const color = colorDe(m, frescura);

      // El radio de error, cuando el móvil lo reportó.
      if (m.posicion.precisionM) {
        areas.push({
          type: "Feature",
          properties: { precisionM: m.posicion.precisionM, color },
          geometry: {
            type: "Point",
            coordinates: [m.posicion.lng, m.posicion.lat],
          },
        });
      }

      let pin = pinsRef.current.get(m.id);
      if (!pin) {
        const el = document.createElement("div");
        el.className = "flota-pin";
        el.innerHTML =
          '<span class="flota-anillo"></span>' +
          '<span class="flota-cuerpo"><span class="flota-tipo"></span></span>';
        const id = m.id;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onMovilRef.current?.(id);
        });
        pin = new mapboxgl.Marker({ element: el })
          .setLngLat([m.posicion.lng, m.posicion.lat])
          .addTo(mapa);
        pinsRef.current.set(m.id, pin);
      } else {
        // Mover, no recrear: así el pin se desliza y se VE moverse.
        pin.setLngLat([m.posicion.lng, m.posicion.lat]);
      }

      const el = pin.getElement();
      const cuerpo = el.querySelector<HTMLElement>(".flota-cuerpo");
      const tipo = el.querySelector<HTMLElement>(".flota-tipo");
      if (cuerpo) {
        cuerpo.style.background = color;
        cuerpo.classList.toggle("flota-vieja", frescura === "ultima-conocida");
      }
      if (tipo) tipo.textContent = etiquetaTipo(m);
      el.classList.toggle("flota-viva", frescura === "viva");

      // El title es el resumen honesto completo: estado, antigüedad y error.
      el.title =
        `${m.id} · ${m.tipo ?? "tipo sin verificar"} · ` +
        `${m.disponible ? "libre" : "ocupado"} · ` +
        `${textoAntiguedad(segundos)} · ${textoPrecision(m.posicion.precisionM)}`;
    }

    for (const [id, pin] of pinsRef.current) {
      if (!vigentes.has(id)) {
        pin.remove();
        pinsRef.current.delete(id);
      }
    }

    (mapa.getSource("precision-gps") as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: areas,
    });

    // Un solo encuadre inicial: el tablero no puede saltar en cada poll.
    if (!encuadradoRef.current && vigentes.size > 0) {
      encuadradoRef.current = true;
      const limites = new mapboxgl.LngLatBounds();
      for (const m of moviles) {
        if (m.posicion) limites.extend([m.posicion.lng, m.posicion.lat]);
      }
      const reducirMovimiento = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      mapa.fitBounds(limites, {
        padding: 80,
        maxZoom: 13.5,
        duration: reducirMovimiento ? 0 : 1600,
      });
    }
  }, [listo, moviles, ahora]);

  // ── El recorrido del móvil seleccionado ────────────────────────
  //
  // Se recarga con `ahora` —el mismo reloj que ya hace latir la consola— para
  // que la traza crezca con los reportes nuevos sin montar un segundo poll.
  //
  // `cancelado` corta la carrera clásica: si el CRUE cambia de móvil mientras
  // una petición está en vuelo, la respuesta vieja llegaría después y pintaría
  // el rastro del móvil equivocado sobre el nuevo.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;

    const fuente = () =>
      mapa.getSource("recorrido") as mapboxgl.GeoJSONSource | undefined;

    if (!movilEnfocado) {
      fuente()?.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    let cancelado = false;
    void (async () => {
      try {
        const r = await pedirRecorrido(movilEnfocado, { limite: 300 });
        if (cancelado) return;
        fuente()?.setData({
          type: "FeatureCollection",
          features: tramosDeRecorrido(r.puntos),
        });
      } catch {
        // Un fallo aquí no puede tumbar el tablero: la traza es contexto, la
        // posición actual es el dato. Se limpia la línea y el mapa sigue
        // mostrando dónde está cada ambulancia.
        if (!cancelado) {
          fuente()?.setData({ type: "FeatureCollection", features: [] });
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [listo, movilEnfocado, ahora]);

  // ── Foco pedido desde la lista ─────────────────────────────────
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo || !foco) return;
    const reducirMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    mapa.flyTo({
      center: [foco.lng, foco.lat],
      zoom: 14,
      duration: reducirMovimiento ? 0 : 1400,
    });
  }, [listo, foco]);

  // ── Render ─────────────────────────────────────────────────────

  if (!token) {
    // Degradación declarada, igual que en MapaRed: la lista por localidad de
    // al lado sigue siendo utilizable sin mapa.
    return (
      <div className="flex h-full w-full items-center justify-center bg-[color:var(--color-superficie)] p-6 text-center text-sm text-[color:var(--color-texto-tenue)]">
        Mapa desactivado — falta NEXT_PUBLIC_MAPBOX_TOKEN. La cobertura por
        localidad sigue disponible en la lista.
      </div>
    );
  }

  const conPosicion = moviles.filter((m) => m.posicion).length;

  return (
    <div className="relative h-full w-full">
      {/* Inline y no `absolute inset-0`: mapbox-gl.css llega después de
          Tailwind en el bundle y su `.mapboxgl-map{position:relative}` pisa la
          clase — el contenedor colapsaba a 0px de alto (mapa negro). */}
      <div ref={contenedorRef} style={{ position: "absolute", inset: 0 }} />

      <div className="pointer-events-none absolute bottom-3 left-1/2 flex w-[min(100%-1.5rem,44rem)] -translate-x-1/2 flex-col items-center gap-2">
        {listo && moviles.length > 0 && conPosicion === 0 && (
          <span className="rounded-full border border-[color:var(--color-borde)] bg-neutral-900/75 px-3 py-1 text-center text-[11px] text-[color:var(--color-texto-tenue)] backdrop-blur-lg">
            Ningún móvil ha reportado posición todavía — la flota aparece en la
            lista, sin pin
          </span>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl border border-[color:var(--color-borde)] bg-neutral-900/75 px-3 py-1.5 text-[11px] text-[color:var(--color-texto-tenue)] backdrop-blur-lg">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: COLOR_LIBRE }} />
            libre
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: COLOR_OCUPADO }} />
            ocupado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: COLOR_SIN_DATO }} />
            última conocida
          </span>
          <span className="flex items-center gap-1.5">
            <span className="grid size-4 place-items-center rounded-full border border-white/60 text-[7px] font-semibold text-white">
              AB
            </span>
            TAB / TAM
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-full border"
              style={{ borderColor: "rgba(255,255,255,.5)", background: "rgba(255,255,255,.12)" }}
            />
            error del GPS
          </span>
        </div>
      </div>

      <style>{`
        .flota-pin {
          position: relative;
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .flota-cuerpo {
          width: 26px;
          height: 26px;
          border-radius: 9999px;
          display: grid;
          place-items: center;
          border: 1.5px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
          /* La transición hace que el móvil se DESLICE entre reportes en vez
             de teletransportarse cada 15 s. */
          transition: background 0.6s ease, transform 0.2s ease;
        }
        .flota-pin:hover .flota-cuerpo { transform: scale(1.14); }
        .flota-tipo {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #0a0e14;
        }
        /* Última posición conocida: borde punteado. Se distingue del resto sin
           depender solo del color. */
        .flota-vieja {
          border-style: dashed;
          opacity: 0.75;
        }
        .flota-anillo {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          border: 2px solid rgba(46, 196, 166, 0.7);
          opacity: 0;
        }
        .flota-viva .flota-anillo {
          animation: flota-latido 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        @keyframes flota-latido {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(2); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .flota-viva .flota-anillo { animation: none; }
          .flota-cuerpo { transition: none; }
        }
      `}</style>
    </div>
  );
}
