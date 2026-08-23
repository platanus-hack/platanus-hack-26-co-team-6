"use client";

/**
 * El SBAR: cuatro líneas y ni una más.
 *
 * Es el formato con el que los clínicos se entregan pacientes —Situación,
 * Background/antecedente, Análisis, Recomendación— y es lo que el hospital lee
 * antes de que la camilla cruce la puerta. Cuatro LÍNEAS, no cuatro párrafos:
 * quien lo lee está de pie, a dos metros, y probablemente ya caminando hacia
 * la sala.
 *
 * ── LO QUE NO ESTÁ AQUÍ ───────────────────────────────────────────
 * El dictado crudo del paramédico. `CasoPublico` lo excluye a propósito y
 * `despojar()` en core deja de compilar si alguien lo agrega. En una pantalla
 * colgada en un pasillo, el audio literal de una escena —con nombres, con
 * direcciones, con lo que la familia gritaba de fondo— no tiene nada que hacer.
 * Esto es una SÍNTESIS, y esa es toda la diferencia.
 */

import type { SbarConProcedencia } from "@/lib/recepcion-modelo";

const LINEAS = [
  { clave: "situacion", letra: "S", nombre: "Situación" },
  { clave: "antecedente", letra: "B", nombre: "Antecedente" },
  { clave: "evaluacion", letra: "A", nombre: "Evaluación" },
  { clave: "recomendacion", letra: "R", nombre: "Recomendación" },
] as const;

export function BloqueSbar({ sbar }: { sbar: SbarConProcedencia | null }) {
  if (!sbar) {
    return (
      <section className="rounded-3xl border border-dashed border-[color:var(--color-borde)] p-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-texto-tenue)]">
          SBAR
        </h2>
        <p className="mt-2 text-[clamp(0.9rem,2vw,1.05rem)]">
          Sin SBAR. Ni el generador (tarea 4.2) ni los campos del caso
          alcanzaron para componerlo: pida la entrega verbal por radio.
        </p>
      </section>
    );
  }

  const compuesto = sbar.motor === "campos-del-caso";

  return (
    <section className="rounded-3xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-texto-tenue)]">
          SBAR · entrega de prearribo
        </h2>
        {/* La procedencia del texto va pegada al texto, no en una nota al pie:
            quien lo lee tiene que saber si lo redactó el generador clínico o
            si son los campos del caso puestos en fila. */}
        <span
          className="text-[10px] sm:text-xs font-semibold"
          style={{
            color: compuesto
              ? "var(--color-alerta)"
              : "var(--color-texto-tenue)",
          }}
        >
          {compuesto ? "▲ compuesto de los campos del caso" : "generado (4.2)"}
        </span>
      </div>

      <dl className="mt-4 space-y-3">
        {LINEAS.map(({ clave, letra, nombre }) => (
          <div key={clave} className="flex items-start gap-3 sm:gap-4">
            <dt
              aria-label={nombre}
              className="w-8 sm:w-10 shrink-0 text-center font-black leading-none
                         text-[clamp(1.25rem,3vw,1.75rem)]
                         text-[color:var(--color-info)]"
            >
              {letra}
            </dt>
            <dd className="min-w-0 flex-1 text-[clamp(0.95rem,2.1vw,1.3rem)] leading-snug break-words">
              {sbar.lineas[clave]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
