"use client";

/**
 * Registro — la auditoría de la sesión (zona 9 de la spec, versión hackathon).
 *
 * Reconstruye la línea de tiempo global de la operación con lo que la consola
 * ya sabe: creación de casos, solicitudes y respuestas (de /estado) más las
 * acciones del regulador (bitácora local). Filtrable y exportable a CSV.
 *
 * "Inmutable" de verdad exige persistencia en core (Supabase) — hasta
 * entonces esto se llama registro DE LA SESIÓN y no promete más de lo que es.
 */

import { useMemo, useState } from "react";
import type { Handshake } from "@/lib/types";
import type { CasoDerivado } from "./derivados";
import { listarEventos } from "./bitacora";

interface Fila {
  ts: string;
  tipo: "caso" | "solicitud" | "respuesta" | "regulador";
  casoId: string;
  actor: string;
  detalle: string;
}

const ETIQUETA_TIPO: Record<Fila["tipo"], string> = {
  caso: "caso creado",
  solicitud: "solicitud",
  respuesta: "respuesta",
  regulador: "regulador",
};

interface Props {
  derivados: CasoDerivado[];
  nombresSedes: ReadonlyMap<string, string>;
  /** true → card glass flotante sobre el mapa: se expande hacia ARRIBA. */
  flotante?: boolean;
}

export default function Registro({ derivados, nombresSedes, flotante = false }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<Fila["tipo"] | "todos">("todos");
  const [q, setQ] = useState("");

  const nombreSede = (codigo: string) => nombresSedes.get(codigo) ?? codigo;

  const filas = useMemo(() => {
    const todas: Fila[] = [];
    for (const d of derivados) {
      todas.push({
        ts: d.caso.creadoEn,
        tipo: "caso",
        casoId: d.caso.id,
        actor: "/campo",
        detalle: d.caso.resumen,
      });
      for (const h of d.handshakes as Handshake[]) {
        todas.push({
          ts: h.enviadoEn,
          tipo: "solicitud",
          casoId: h.casoId,
          actor: h.canal,
          detalle: `enviada a ${nombreSede(h.sedeCodigo)}`,
        });
        if (h.respondidoEn) {
          todas.push({
            ts: h.respondidoEn,
            tipo: "respuesta",
            casoId: h.casoId,
            actor: nombreSede(h.sedeCodigo),
            detalle:
              h.estado === "aceptado"
                ? `aceptó en ${h.latenciaS}s`
                : `rechazó: ${h.motivoRechazo ?? "sin motivo"}`,
          });
        }
      }
    }
    for (const e of listarEventos()) {
      todas.push({
        ts: e.ts,
        tipo: "regulador",
        casoId: e.casoId,
        actor: `${e.regulador} (registro local)`,
        detalle: e.texto,
      });
    }
    return todas.sort((a, b) => b.ts.localeCompare(a.ts));
    // La bitácora local cambia junto con las acciones que ya mueven derivados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivados, nombresSedes]);

  const visibles = filas.filter((f) => {
    if (filtroTipo !== "todos" && f.tipo !== filtroTipo) return false;
    const texto = q.trim().toLowerCase();
    if (!texto) return true;
    return (
      f.casoId.toLowerCase().includes(texto) ||
      f.actor.toLowerCase().includes(texto) ||
      f.detalle.toLowerCase().includes(texto)
    );
  });

  function exportarCsv() {
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const lineas = [
      "ts,tipo,caso,actor,detalle",
      ...visibles.map((f) =>
        [f.ts, ETIQUETA_TIPO[f.tipo], f.casoId, f.actor, f.detalle]
          .map(esc)
          .join(","),
      ),
    ];
    // BOM para que Excel en español abra el UTF-8 sin ensalada de tildes.
    const blob = new Blob(["﻿" + lineas.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulso-crue-registro-${new Date().toISOString().slice(0, 16).replace(":", "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      aria-label="Registro de la sesión"
      // flex-col-reverse: en flotante el botón queda abajo y el panel ABRE
      // hacia arriba, porque la card vive pegada al borde inferior del mapa.
      className={flotante ? "flex flex-col-reverse gap-2" : "mt-6"}
    >
      <div
        className={`flex items-center gap-3 flex-wrap ${
          flotante
            ? "px-2 py-1.5 rounded-2xl bg-neutral-900/75 backdrop-blur-lg border border-[color:var(--color-borde)]"
            : ""
        }`}
      >
        <button
          onClick={() => setAbierto((v) => !v)}
          className="px-4 py-2 rounded-full border border-[color:var(--color-borde)] text-sm font-medium"
        >
          {abierto ? "▾" : "▸"} Registro de la sesión ({filas.length})
        </button>
        {abierto && (
          <>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
              className="px-3 py-2 rounded-full bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] text-xs"
              aria-label="Filtrar por tipo de evento"
            >
              <option value="todos">todos los eventos</option>
              <option value="caso">casos creados</option>
              <option value="solicitud">solicitudes</option>
              <option value="respuesta">respuestas</option>
              <option value="regulador">acciones del regulador</option>
            </select>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar por caso, sede…"
              className="px-4 py-2 rounded-full bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] text-xs w-48 focus:outline-none focus:border-[color:var(--color-info)]"
            />
            <button
              onClick={exportarCsv}
              disabled={visibles.length === 0}
              className="ml-auto px-4 py-2 rounded-full bg-[color:var(--color-info)] text-[#04121f] text-sm font-semibold disabled:opacity-40"
            >
              Exportar CSV ({visibles.length})
            </button>
          </>
        )}
      </div>

      {abierto && (
        <div
          className={`rounded-[2rem] border border-[color:var(--color-borde)] overflow-hidden ${
            flotante ? "bg-neutral-900/85 backdrop-blur-xl" : "mt-3"
          }`}
        >
          <div
            className={`${flotante ? "max-h-56" : "max-h-72"} overflow-y-auto overflow-x-auto`}
          >
            <table className="w-full text-xs">
              <thead className="text-[color:var(--color-texto-tenue)] sticky top-0 bg-[color:var(--color-superficie)]">
                <tr className="text-left">
                  <th className="p-2.5 font-normal w-20">Hora</th>
                  <th className="p-2.5 font-normal w-24">Tipo</th>
                  <th className="p-2.5 font-normal w-20">Caso</th>
                  <th className="p-2.5 font-normal w-40">Actor</th>
                  <th className="p-2.5 font-normal">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-4 text-center text-[color:var(--color-texto-tenue)]"
                    >
                      Sin eventos con ese filtro.
                    </td>
                  </tr>
                )}
                {visibles.map((f, i) => (
                  <tr key={i} className="border-t border-[color:var(--color-borde)]">
                    <td className="p-2.5 tabular whitespace-nowrap">
                      {new Date(f.ts).toLocaleTimeString("es-CO", { hour12: false })}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          f.tipo === "regulador"
                            ? "bg-[color:var(--color-critico)]/15 text-[color:var(--color-critico)]"
                            : f.tipo === "respuesta"
                              ? "bg-[color:var(--color-info)]/15 text-[color:var(--color-info)]"
                              : "bg-[color:var(--color-borde)] text-[color:var(--color-texto-tenue)]"
                        }`}
                      >
                        {ETIQUETA_TIPO[f.tipo]}
                      </span>
                    </td>
                    <td className="p-2.5 tabular">{f.casoId.slice(0, 8)}</td>
                    <td className="p-2.5 truncate max-w-40">{f.actor}</td>
                    <td className="p-2.5">{f.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="p-2.5 text-[10px] text-[color:var(--color-texto-tenue)] border-t border-[color:var(--color-borde)]">
            Registro de esta sesión. La versión inmutable (todas las sesiones,
            todos los reguladores) llega con la persistencia de eventos en core.
          </p>
        </div>
      )}
    </section>
  );
}
