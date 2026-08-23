"use client";

/**
 * /crue/cobertura — la flota de la ciudad (tarea 3.7).
 *
 * Responde dos preguntas y ninguna más: **dónde están los móviles** y **en qué
 * estado**. Pines por tipo (TAB/TAM) y estado (libre/ocupado), agrupados por
 * localidad y contados.
 *
 * ══════════════════════════════════════════════════════════════════
 *  EL LÍMITE QUE EL EQUIPO YA FIJÓ, Y QUE ESTA PANTALLA NO CRUZA
 *
 *  PULSO le MUESTRA la cobertura al CRUE. **No asigna móviles.**
 *  Reposicionar ambulancias es función legal del CRUE (Res. 1220/2010);
 *  una consola que lo insinúe —aunque sea con un botón deshabilitado—
 *  debilita el argumento del producto. Aquí no hay ni una acción que
 *  mueva una unidad, y no debe añadirse ninguna.
 * ══════════════════════════════════════════════════════════════════
 *
 * Honestidad, en tres sitios visibles:
 *   · el alcance con el que se resolvió esta lista (organización o red) y si
 *     la identidad todavía es provisional (tarea 1.3 sin cerrar);
 *   · la localidad, que es ESTIMADA por la sede REPS más cercana;
 *   · el radio de error del GPS de cada móvil, dibujado en el mapa.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft, RefreshCw } from "lucide-react";
import type { Coordenada } from "@/lib/types";
import * as flota from "@/lib/api-moviles";
import {
  agruparPorLocalidad,
  contar,
  type MovilCobertura,
} from "@/lib/posicion-modelo";
import PanelLocalidades from "@/components/crue/cobertura/PanelLocalidades";

// mapbox-gl toca window al importarse: solo en el navegador.
const MapaCobertura = dynamic(() => import("@/components/crue/MapaCobertura"), {
  ssr: false,
  loading: () => (
    <div className="latido h-full w-full bg-[color:var(--color-superficie)]" />
  ),
});

/**
 * Cada 4 s. Más lento que el tablero de casos (2.5 s) a propósito: un móvil
 * reporta cada 15 s, así que pedir más rápido solo gasta datos y batería del
 * servidor sin traer un dato nuevo.
 */
const POLL_MS = 4000;

function Kpi({ etiqueta, valor, color }: { etiqueta: string; valor: number; color?: string }) {
  return (
    <div className="min-w-[4.5rem] rounded-2xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] px-3 py-2">
      <div
        className="font-mono text-lg leading-none tabular-nums"
        style={color ? { color } : undefined}
      >
        {valor}
      </div>
      <div className="mt-1 text-[11px] text-[color:var(--color-texto-tenue)]">
        {etiqueta}
      </div>
    </div>
  );
}

export default function Cobertura() {
  const [moviles, setMoviles] = useState<MovilCobertura[]>([]);
  const [alcance, setAlcance] = useState<"organizacion" | "red" | null>(null);
  const [identidad, setIdentidad] = useState<"actor" | "provisional" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [foco, setFoco] = useState<Coordenada | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  // Reloj de consola: un solo tick alimenta todas las antigüedades. Arranca en
  // null para que el HTML del servidor y el primer render del cliente
  // coincidan (nada dinámico hasta montar).
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    // En un microtask: un setState síncrono dentro del efecto encadena un
    // render extra en cada montaje. Mismo patrón que useConectividad.
    queueMicrotask(() => setAhora(Date.now()));
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await flota.moviles();
      setMoviles(r.moviles);
      setAlcance(r.alcance);
      setIdentidad(r.identidad);
      setError(null);
    } catch (e) {
      // Un parpadeo de core no puede vaciar el tablero: se conserva lo último
      // bueno y se dice que está congelado.
      setError(e instanceof Error ? e.message : "core no responde");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void cargar());
    const id = setInterval(() => void cargar(), POLL_MS);
    return () => clearInterval(id);
  }, [cargar]);

  const total = useMemo(() => contar(moviles, ahora ?? 0), [moviles, ahora]);
  const grupos = useMemo(
    () => agruparPorLocalidad(moviles, ahora ?? 0),
    [moviles, ahora],
  );

  const verEnMapa = useCallback((m: MovilCobertura) => {
    if (!m.posicion) return;
    setSeleccionado(m.id);
    setFoco({ lat: m.posicion.lat, lng: m.posicion.lng });
  }, []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[color:var(--color-fondo)]">
      <header className="border-b border-[color:var(--color-borde)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href="/crue"
            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-[color:var(--color-texto-tenue)] transition-colors hover:text-[color:var(--color-texto)]"
          >
            <ChevronLeft className="size-4" strokeWidth={2.5} aria-hidden />
            Regulación
          </Link>
          <h1 className="text-base font-semibold">Cobertura de la flota</h1>
          <button
            type="button"
            onClick={() => void cargar()}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-[color:var(--color-texto-tenue)] transition-colors hover:text-[color:var(--color-texto)]"
          >
            <RefreshCw className="size-4" aria-hidden />
            Actualizar
          </button>
        </div>

        {/*
          La frase no es decorativa: es el límite del producto escrito donde lo
          lee el regulador. Debajo no hay ninguna acción que mueva un móvil.
        */}
        <p className="mt-1 text-xs text-[color:var(--color-texto-tenue)]">
          PULSO muestra la cobertura. La regulación de la flota es del CRUE
          (Res. 1220/2010): esta pantalla no asigna ni reubica móviles.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Kpi etiqueta="móviles" valor={total.total} />
          <Kpi etiqueta="libres" valor={total.libres} color="#2ec4a6" />
          <Kpi etiqueta="ocupados" valor={total.ocupados} color="#ff9f1c" />
          <Kpi etiqueta="TAB" valor={total.tab} />
          <Kpi etiqueta="TAM" valor={total.tam} />
          <Kpi etiqueta="sin señal" valor={total.ultimaConocida} color="#8b9bb0" />
          <Kpi etiqueta="sin reporte" valor={total.sinPosicion} color="#8b9bb0" />
        </div>

        {/* ── Lo que esta pantalla NO sabe, dicho en pantalla ── */}
        <div className="mt-2 flex flex-col gap-1 text-[11px] text-[color:var(--color-texto-tenue)]">
          {alcance && (
            <p>
              {alcance === "red"
                ? "Alcance: red completa de la ciudad."
                : "Alcance: solo los móviles de esta organización."}
              {identidad === "provisional" && (
                <>
                  {" "}
                  <span className="text-[color:var(--color-alerta)]">
                    Identidad provisional
                  </span>{" "}
                  — core todavía autentica con la contraseña de turno (tarea
                  1.3). El alcance lo fija la configuración del servidor, no un
                  rol verificado.
                </>
              )}
            </p>
          )}
          <p>
            Localidad <strong>estimada</strong> por la sede REPS más cercana:
            Bogotá no publica aquí sus polígonos. El círculo del mapa es el
            error del GPS reportado, y en interiores son cientos de metros.
          </p>
          {total.sinTipo > 0 && (
            <p>
              {total.sinTipo} móvil(es) con el tipo sin verificar: TAB/TAM sale
              del registro con la tarea 3.6, no del cliente.
            </p>
          )}
          {error && (
            <p role="status" className="text-[color:var(--color-alerta)]">
              Sin señal de core ({error}) — se muestra el último estado
              recibido.
            </p>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* En móvil el mapa ocupa media pantalla y la lista queda debajo: la
            lista es la que se lee con una mano. */}
        <div className="relative h-[45vh] w-full lg:h-auto lg:min-h-0 lg:flex-1">
          <MapaCobertura
            moviles={moviles}
            ahora={ahora}
            foco={foco}
            onMovil={(id) => setSeleccionado(id)}
          />
        </div>

        <aside className="w-full border-t border-[color:var(--color-borde)] p-4 lg:w-[23rem] lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <h2 className="mb-3 text-xs tracking-wide text-[color:var(--color-texto-tenue)] uppercase">
            Por localidad
          </h2>
          <PanelLocalidades
            grupos={grupos}
            ahora={ahora}
            onVerEnMapa={verEnMapa}
            seleccionado={seleccionado}
          />
        </aside>
      </div>
    </div>
  );
}
