"use client";

/**
 * Cómo está la red ahora mismo.
 *
 * ── POR QUÉ ESTO NO NECESITABA UN AGENTE ──────────────────────────
 * `GET /estado` ya devuelve la congestión de las 84 sedes de Bogotá, con
 * nombre, índice, aceptados, rechazados y coordenada. Ese dato llevaba
 * viajando al navegador desde el principio y ninguna consola de campo lo
 * pintaba: la pregunta "¿cómo está el San Carlos ahora?" se respondía por
 * radio.
 *
 * Preguntárselo a un agente conversacional habría sido montar una tubería
 * entera para leer un array que ya estaba en memoria. El agente tiene sentido
 * para lo que exige criterio —"¿a dónde me conviene ir con esto?"—, no para
 * lo que es una consulta.
 *
 * ── LO QUE ESTE NÚMERO ES Y NO ES ─────────────────────────────────
 * El índice sale del comportamiento observado (aceptaciones y rechazos) más
 * el snapshot REPS, no de una declaración en vivo del hospital. Eso llega con
 * `/hospital/capacidad`. Mientras tanto se dice de dónde viene, porque un
 * "crítica" que en realidad significa "no tenemos datos" es peor que nada.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  buscarSedes,
  COLOR_CONGESTION,
  type SedeEstado,
} from "@/lib/tablero-modelo";

export function EstadoHospitales({ sedes }: { sedes: SedeEstado[] }) {
  const [texto, setTexto] = useState("");
  const visibles = useMemo(() => buscarSedes(sedes, texto), [sedes, texto]);

  if (sedes.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]/70 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Estado de la red
        </h2>
        <span className="tabular text-xs text-[color:var(--color-texto-tenue)]">
          {sedes.length} sedes
        </span>
      </div>

      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-texto-tenue)]"
          strokeWidth={2}
          aria-hidden
        />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar un hospital…"
          aria-label="Buscar un hospital por nombre o código"
          className="h-11 w-full rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)]/70 pl-10 pr-3 text-sm outline-none placeholder:text-[color:var(--color-texto-tenue)]/60 focus:border-[color:var(--color-info)]"
        />
      </div>

      <ul className="space-y-1.5">
        {visibles.map((s) => (
          <li
            key={s.codigo}
            className="flex items-center gap-3 rounded-xl border border-[color:var(--color-borde)]/60 px-3 py-2.5"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: COLOR_CONGESTION[s.etiqueta] }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm leading-tight">{s.nombre}</p>
              <p className="text-[11px] text-[color:var(--color-texto-tenue)]">
                {s.aceptados} aceptados · {s.rechazados} rechazados
              </p>
            </div>
            <span
              className="shrink-0 text-xs font-semibold capitalize"
              style={{ color: COLOR_CONGESTION[s.etiqueta] }}
            >
              {s.etiqueta}
            </span>
          </li>
        ))}
      </ul>

      {visibles.length === 0 && (
        <p className="py-3 text-center text-xs text-[color:var(--color-texto-tenue)]">
          Ninguna sede con ese nombre.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--color-texto-tenue)]">
        Congestión observada por PULSO: aceptaciones y rechazos reales sobre el
        snapshot REPS. <strong className="font-semibold">No</strong> es una
        declaración en vivo del hospital — esa llega con la consola de capacidad.
      </p>
    </section>
  );
}
