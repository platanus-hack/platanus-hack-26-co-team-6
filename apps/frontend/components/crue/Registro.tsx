"use client";

/**
 * Registro — la auditoría de la sesión (zona 9 de la spec, versión hackathon).
 *
 * Reconstruye la línea de tiempo global de la operación con lo que la consola
 * ya sabe: creación de casos, solicitudes y respuestas (de /estado) más los
 * `evento_caso` que guarda core. Filtrable y exportable a CSV.
 *
 * ── QUÉ CAMBIÓ CON LA TAREA 3.11 ──────────────────────────────────
 * Las acciones del regulador ya NO salen del `localStorage` del navegador:
 * las escribe el servidor y las lee cualquiera que abra esta consola, en
 * cualquier máquina. Por eso desapareció el rótulo "registro local" — dejó de
 * ser verdad.
 *
 * Lo que todavía no promete: mientras core guarde los eventos en memoria
 * (tarea 3.1), un reinicio se los lleva. La consola lo dice al pie en vez de
 * dejar creer que es inmutable.
 */

import { useEffect, useMemo, useState } from "react";
import type { Handshake } from "@/lib/types";
import type { CasoDerivado } from "./derivados";
import { bitacoraReciente, type EventoBitacora } from "./bitacora";

/**
 * Cada cuánto se relee el registro del servidor.
 *
 * Más lento que el polling de /estado (2 s) a propósito: los eventos de
 * auditoría no cambian cada dos segundos y esta consola ya tiene una petición
 * en vuelo cada tick. Un override propio aparece de inmediato porque el panel
 * del caso recarga su bitácora al confirmarlo.
 */
const CADA_MS = 10_000;

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

  // Los eventos que guarda core. Antes esto era `listarEventos()` leyendo
  // localStorage; ahora es la misma historia, pero del servidor.
  const [eventos, setEventos] = useState<EventoBitacora[]>([]);
  const [modo, setModo] = useState<"memoria" | "postgres" | null>(null);
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const leer = async () => {
      try {
        const bitacora = await bitacoraReciente();
        if (!vigente) return;
        setEventos(bitacora.eventos);
        setModo(bitacora.modo);
        setErrorRegistro(null);
      } catch (e) {
        if (!vigente) return;
        // No se vacía la lista: lo último que se leyó sigue siendo cierto. Lo
        // que cambia es que se avisa de que puede estar desactualizado.
        setErrorRegistro(e instanceof Error ? e.message : "core no respondió");
      }
    };
    void leer();
    const id = setInterval(() => void leer(), CADA_MS);
    return () => {
      vigente = false;
      clearInterval(id);
    };
  }, []);

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
    for (const e of eventos) {
      todas.push({
        ts: e.ts,
        tipo: "regulador",
        casoId: e.casoId,
        // Sin "(registro local)": esto lo guarda el servidor. El rótulo que sí
        // hace falta es otro — si fue una persona o un servicio automático.
        actor: e.actor,
        detalle: e.texto,
      });
    }
    return todas.sort((a, b) => b.ts.localeCompare(a.ts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivados, nombresSedes, eventos]);

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
    /**
     * Escapa una celda para CSV.
     *
     * Las comillas es la parte obvia. La comilla simple de delante NO es
     * decorativa: Excel, LibreOffice y Sheets interpretan como FÓRMULA
     * cualquier celda que empiece por = + - @ o un tabulador, y aquí el
     * contenido no es nuestro — `detalle` arrastra el resumen clínico, que
     * sale de un dictado transcrito. Un texto que empiece por "=" se
     * ejecutaría al abrir la auditoría en Excel.
     *
     * El prefijo `'` es la convención de esas hojas de cálculo para "esto es
     * texto literal": no se muestra en la celda.
     */
    const esc = (v: string) => {
      const seguro = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return `"${seguro.replaceAll('"', '""')}"`;
    };
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
            {errorRegistro
              ? `No se pudo releer el registro del servidor (${errorRegistro}): lo de arriba puede estar desactualizado.`
              : modo === "memoria"
                ? "Las acciones del regulador las guarda core y las ven todos los reguladores, en cualquier máquina. Hoy viven en memoria: un reinicio de core se las lleva."
                : "Las acciones del regulador las guarda core: append-only, nadie las edita ni las borra."}
          </p>
        </div>
      )}
    </section>
  );
}
