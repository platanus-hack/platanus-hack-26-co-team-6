"use client";

/**
 * El tablero del turno.
 *
 * Sustituye a las dos listas sueltas que había. La diferencia no es de tamaño:
 * es de criterio. Antes el orden era cronológico —lo más nuevo arriba—; ahora
 * es por **deuda**: primero lo que nadie ha resuelto, después lo que espera
 * respuesta, y al final el historial.
 *
 * Con dos casos daba igual. Con doce, en un accidente con varios heridos, la
 * diferencia es si alguien se queda sin mirar.
 *
 * Las reglas (agrupar, ordenar, buscar) están en `lib/tablero-modelo.ts`, sin
 * React y con tests. Aquí solo se pinta.
 */

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ETIQUETA_TRIAGE, esHoraDorada } from "@/lib/presentacion";
import type { NivelTriage } from "@/lib/types";
import {
  agrupar,
  COLOR_ETAPA,
  ETIQUETA_ETAPA,
  FILTRO_VACIO,
  hayFiltro,
  type CasoTablero,
  type Etapa,
  type Filtro,
} from "@/lib/tablero-modelo";

const TRIAGES: NivelTriage[] = [1, 2, 3, 4, 5];
const ETAPAS: Etapa[] = ["por-atender", "esperando", "rebotado", "aceptado"];

export function TableroCasos({
  items,
  seleccionado,
  onSeleccionar,
}: {
  items: CasoTablero[];
  seleccionado: string | null;
  onSeleccionar: (casoId: string) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VACIO);
  const [abiertoFiltros, setAbiertoFiltros] = useState(false);

  const g = useMemo(() => agrupar(items, filtro), [items, filtro]);
  const visibles = g.porAtender.length + g.enCurso.length + g.cerrados.length;
  const filtrando = hayFiltro(filtro);

  const alternar = <T,>(lista: T[], valor: T): T[] =>
    lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];

  return (
    <section className="flex flex-col gap-4">
      {/* ── Buscador ── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-texto-tenue)]"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={filtro.texto}
            onChange={(e) => setFiltro((f) => ({ ...f, texto: e.target.value }))}
            placeholder="Diagnóstico, CIE-10, móvil…"
            aria-label="Buscar en los casos del turno"
            className="h-12 w-full rounded-2xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] pl-10 pr-3 text-base outline-none placeholder:text-[color:var(--color-texto-tenue)]/60 focus:border-[color:var(--color-info)]"
          />
        </div>
        <button
          onClick={() => setAbiertoFiltros((a) => !a)}
          aria-expanded={abiertoFiltros}
          aria-label="Filtros"
          className={`grid size-12 shrink-0 place-items-center rounded-2xl border ${
            filtro.triages.length || filtro.etapas.length
              ? "border-[color:var(--color-info)] text-[color:var(--color-info)]"
              : "border-[color:var(--color-borde)]"
          }`}
        >
          <SlidersHorizontal className="size-5" strokeWidth={2} aria-hidden />
        </button>
      </div>

      {abiertoFiltros && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]/60 p-4">
          <Grupo rotulo="Triage">
            {TRIAGES.map((t) => (
              <Chip
                key={t}
                activo={filtro.triages.includes(t)}
                color={esHoraDorada(t) ? "var(--color-critico)" : undefined}
                onClick={() =>
                  setFiltro((f) => ({ ...f, triages: alternar(f.triages, t) }))
                }
              >
                {ETIQUETA_TRIAGE[t].split(" · ")[0]}
              </Chip>
            ))}
          </Grupo>

          <Grupo rotulo="Estado">
            {ETAPAS.map((e) => (
              <Chip
                key={e}
                activo={filtro.etapas.includes(e)}
                color={COLOR_ETAPA[e]}
                onClick={() =>
                  setFiltro((f) => ({ ...f, etapas: alternar(f.etapas, e) }))
                }
              >
                {ETIQUETA_ETAPA[e].split(" · ")[0]}
              </Chip>
            ))}
          </Grupo>
        </div>
      )}

      {filtrando && (
        <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--color-texto-tenue)]">
          <span>
            {visibles} de {g.total} casos del turno
          </span>
          <button
            onClick={() => setFiltro(FILTRO_VACIO)}
            className="inline-flex min-h-11 items-center gap-1 text-[color:var(--color-info)]"
          >
            <X className="size-3.5" strokeWidth={2.5} aria-hidden />
            Quitar filtros
          </button>
        </div>
      )}

      {/* ── Los tres grupos, en orden de deuda ── */}
      <Bloque
        rotulo="Por atender"
        detalle="nadie los ha despachado todavía"
        items={g.porAtender}
        destacado
        seleccionado={seleccionado}
        onSeleccionar={onSeleccionar}
      />
      <Bloque
        rotulo="En curso"
        detalle="esperando respuesta del hospital"
        items={g.enCurso}
        seleccionado={seleccionado}
        onSeleccionar={onSeleccionar}
      />
      <Bloque
        rotulo="Cerrados"
        detalle="aceptados en este turno"
        items={g.cerrados}
        seleccionado={seleccionado}
        onSeleccionar={onSeleccionar}
      />

      {visibles === 0 && (
        <p className="py-6 text-center text-xs text-[color:var(--color-texto-tenue)]">
          {filtrando
            ? "Ningún caso coincide con la búsqueda."
            : "Todavía no hay casos en este turno."}
        </p>
      )}

      {g.cerrados.length > 0 && (
        <p className="text-[11px] leading-relaxed text-[color:var(--color-texto-tenue)]">
          Los casos de este turno, tal como los registró el sistema. El historial
          completo por móvil llega con la persistencia.
        </p>
      )}
    </section>
  );
}

// ── Piezas ───────────────────────────────────────────────────────

function Bloque({
  rotulo,
  detalle,
  items,
  destacado,
  seleccionado,
  onSeleccionar,
}: {
  rotulo: string;
  detalle: string;
  items: CasoTablero[];
  destacado?: boolean;
  seleccionado: string | null;
  onSeleccionar: (casoId: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 flex items-baseline gap-2">
        <span
          className={`text-xs uppercase tracking-wide ${
            destacado
              ? "font-bold text-[color:var(--color-texto)]"
              : "text-[color:var(--color-texto-tenue)]"
          }`}
        >
          {rotulo}
        </span>
        <span className="tabular text-xs text-[color:var(--color-texto-tenue)]">
          {items.length}
        </span>
        <span className="min-w-0 truncate text-[11px] text-[color:var(--color-texto-tenue)]">
          · {detalle}
        </span>
      </h2>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.caso.id}>
            <FilaCaso
              item={i}
              abierto={seleccionado === i.caso.id}
              onAbrir={onSeleccionar}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Una fila. Lleva lo que se pregunta en una ambulancia y no una línea más:
 * qué tiene, qué tan grave, cuánto lleva, en qué punto está y quién lo lleva.
 */
function FilaCaso({
  item,
  abierto,
  onAbrir,
}: {
  item: CasoTablero;
  abierto: boolean;
  onAbrir: (casoId: string) => void;
}) {
  const { caso, etapa, transcurridoS, cierreS } = item;
  const critico = esHoraDorada(caso.triage);
  const cerrado = etapa === "aceptado";

  return (
    <button
      onClick={() => onAbrir(caso.id)}
      aria-expanded={abierto}
      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
        critico && !cerrado
          ? "border-[color:var(--color-critico)]/50 bg-[color:var(--color-critico)]/10"
          : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]/70"
      } ${abierto ? "ring-2 ring-[color:var(--color-info)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">
            {caso.dxDescripcion}
          </p>
          <p className="mt-0.5 truncate text-xs text-[color:var(--color-texto-tenue)]">
            Triage {ETIQUETA_TRIAGE[caso.triage]} · {caso.tipoMovil}
            {caso.edad !== null ? ` · ${caso.edad} a` : ""}
            {caso.sexo ? ` · ${caso.sexo}` : ""}
            {caso.unidad?.id ? ` · ${caso.unidad.id}` : ""}
          </p>
        </div>

        <div className="shrink-0 text-right tabular">
          <div
            className={`font-bold leading-none ${
              cerrado
                ? "text-sm text-[color:var(--color-estable)]"
                : "text-2xl"
            }`}
          >
            {cerrado
              ? cierreS === null
                ? "—"
                : reloj(cierreS)
              : reloj(transcurridoS)}
          </div>
          <div className="text-[10px] text-[color:var(--color-texto-tenue)]">
            {cerrado ? "hasta destino" : "en curso"}
          </div>
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
        <span
          className={`inline-block size-1.5 shrink-0 rounded-full ${
            etapa === "esperando" || etapa === "por-atender" ? "latido" : ""
          }`}
          style={{ background: COLOR_ETAPA[etapa] }}
          aria-hidden
        />
        <span style={{ color: COLOR_ETAPA[etapa] }}>{ETIQUETA_ETAPA[etapa]}</span>
      </p>
    </button>
  );
}

function Grupo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
        {rotulo}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  activo,
  color,
  onClick,
  children,
}: {
  activo: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className="min-h-11 rounded-xl border px-3 text-xs transition-colors"
      style={{
        borderColor: activo ? (color ?? "var(--color-info)") : "var(--color-borde)",
        color: activo ? (color ?? "var(--color-info)") : "var(--color-texto-tenue)",
        background: activo ? `color-mix(in srgb, ${color ?? "var(--color-info)"} 12%, transparent)` : undefined,
      }}
    >
      {children}
    </button>
  );
}

/** mm:ss mientras tenga sentido; a partir de una hora, hh:mm:ss. */
function reloj(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const seg = t % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dos(m)}:${dos(seg)}` : `${m}:${dos(seg)}`;
}
