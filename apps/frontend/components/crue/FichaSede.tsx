"use client";

/**
 * FichaSede — pop-up de una IPS visto desde el CRUE.
 *
 * Pinta SOLO lo que la capa de datos sabe hoy: congestión inferida (rotulada
 * estimada), historial de respuestas y las solicitudes activas dirigidas a la
 * sede. Servicios habilitados, camas por tipo y nivel llegan cuando core
 * exponga GET /sedes (propuesto, carril de Zaid) — hasta entonces la ficha lo
 * declara en vez de inventarlo.
 */

import { AnimatePresence, motion } from "motion/react";
import type { CongestionSede, Handshake } from "@/lib/types";
import type { CasoDerivado } from "./derivados";
import { FotoCalle } from "@/components/mapa/FotoCalle";

const SUAVE = [0.22, 1, 0.36, 1] as const;

function colorIndice(indice: number): string {
  if (indice > 0.85) return "var(--color-critico)";
  if (indice > 0.7) return "var(--color-alerta)";
  return "var(--color-estable)";
}

interface Props {
  /** null = cerrada. */
  sede: CongestionSede | null;
  /** Todos los handshakes de la red (se filtran aquí por sede). */
  handshakes: Handshake[];
  derivados: CasoDerivado[];
  onCerrar: () => void;
  /** Centra el mapa en la sede. Ausente si la sede no tiene coord. */
  onVerEnMapa?: (() => void) | null;
}

export default function FichaSede({
  sede,
  handshakes,
  derivados,
  onCerrar,
  onVerEnMapa,
}: Props) {
  const dirigidos = sede
    ? handshakes
        .filter((h) => h.sedeCodigo === sede.codigo)
        .sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn))
        .slice(0, 6)
    : [];
  const resumenCaso = (casoId: string) =>
    derivados.find((d) => d.caso.id === casoId)?.caso.resumen ?? casoId.slice(0, 8);

  const total = sede ? sede.aceptados + sede.rechazados : 0;

  return (
    <AnimatePresence>
      {sede && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onCerrar}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            transition={{ duration: 0.3, ease: SUAVE }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-[2rem] bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] p-5 space-y-4"
            role="dialog"
            aria-label={`Ficha de ${sede.nombre}`}
          >
            <header className="space-y-1">
              <h3 className="font-bold leading-tight">{sede.nombre}</h3>
              <p className="text-[11px] text-[color:var(--color-texto-tenue)] tabular">
                {sede.codigo}
              </p>
            </header>

            {/* Congestión inferida — siempre "estimada", nunca ocupación real */}
            <section className="p-3 rounded-2xl bg-[color:var(--color-superficie-alta)] border border-[color:var(--color-borde)] space-y-2">
              <div className="flex items-baseline justify-between text-xs">
                <span className="uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
                  Congestión estimada
                </span>
                <span
                  className="font-bold text-base tabular"
                  style={{ color: colorIndice(sede.indice) }}
                >
                  {Math.round(sede.indice * 100)}% · {sede.etiqueta}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[color:var(--color-borde)] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${sede.indice * 100}%`,
                    background: colorIndice(sede.indice),
                  }}
                />
              </div>
              <p className="text-[11px] text-[color:var(--color-texto-tenue)] leading-relaxed">
                Inferida del snapshot REPS, la curva horaria y los rechazos.
                Ninguna IPS reportó este número.
              </p>
            </section>

            {/* Historial de respuestas */}
            <section className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-2xl border border-[color:var(--color-borde)]">
                <div className="text-xl font-bold tabular text-[color:var(--color-estable)]">
                  {sede.aceptados}
                </div>
                <div className="text-[10px] uppercase text-[color:var(--color-texto-tenue)]">
                  aceptados
                </div>
              </div>
              <div className="p-2 rounded-2xl border border-[color:var(--color-borde)]">
                <div className="text-xl font-bold tabular text-[color:var(--color-critico)]">
                  {sede.rechazados}
                </div>
                <div className="text-[10px] uppercase text-[color:var(--color-texto-tenue)]">
                  rechazados
                </div>
              </div>
              <div className="p-2 rounded-2xl border border-[color:var(--color-borde)]">
                <div className="text-xl font-bold tabular">
                  {total === 0 ? "—" : `${Math.round((sede.aceptados / total) * 100)}%`}
                </div>
                <div className="text-[10px] uppercase text-[color:var(--color-texto-tenue)]">
                  tasa
                </div>
              </div>
            </section>

            {/* Solicitudes dirigidas a esta sede */}
            <section className="space-y-1.5">
              <h4 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
                Solicitudes recientes hacia esta sede
              </h4>
              {dirigidos.length === 0 && (
                <p className="text-xs text-[color:var(--color-texto-tenue)]">
                  Ninguna en esta sesión.
                </p>
              )}
              {dirigidos.map((h) => (
                <div
                  key={h.id}
                  className="p-2.5 rounded-xl border border-[color:var(--color-borde)] text-xs flex items-center gap-2"
                >
                  <span className="truncate flex-1">{resumenCaso(h.casoId)}</span>
                  <span
                    className="px-2 py-0.5 rounded-full font-semibold shrink-0"
                    style={{
                      background:
                        h.estado === "aceptado"
                          ? "var(--color-estable)"
                          : h.estado === "enviado"
                            ? "var(--color-alerta)"
                            : "var(--color-critico)",
                      color: "#04121f",
                    }}
                  >
                    {h.estado}
                  </span>
                </div>
              ))}
            </section>

            {/* Así se ve la llegada (Mapillary): se oculta sola sin token
                o sin cobertura en esa cuadra. */}
            {sede.coord && (
              <FotoCalle coord={sede.coord} titulo={sede.nombre} />
            )}

            <p className="text-[11px] text-[color:var(--color-texto-tenue)]">
              Servicios habilitados, camas y nivel: pendientes de{" "}
              <code>GET /sedes</code> en core. Esta ficha no inventa capacidad.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onCerrar}
                className="rounded-full border border-[color:var(--color-borde)] font-medium"
              >
                Cerrar
              </button>
              <button
                onClick={onVerEnMapa ?? undefined}
                disabled={!onVerEnMapa}
                className="rounded-full font-semibold bg-[color:var(--color-info)] text-[#04121f] disabled:opacity-40"
              >
                Ver en el mapa
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
