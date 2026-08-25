"use client";

/**
 * La revisión clínica que `requires_human_review` pide y que antes no
 * existía: la pantalla se quedaba en "vuelve al dictado", un callejón.
 *
 * PULSO propone (lo que la extracción alcanzó a entender, precargado), el
 * humano decide (corrige, y confirma con su nombre). El caso confirmado
 * lleva `revisionHumana` y con eso core sí lo deja pasar a /match — la
 * confianza del parser no se toca: queda 0.35 escrito en la auditoría.
 *
 * Las reglas de qué se puede confirmar viven en `lib/revision-clinica.ts`,
 * probadas sin React; aquí solo se pintan.
 */

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import type { Caso, NivelTriage, Sexo } from "@/lib/types";
import { ETIQUETA_TRIAGE } from "@/lib/presentacion";
import {
  type CamposRevision,
  faltantes,
  partirSignos,
  precargar,
} from "@/lib/revision-clinica";

const NIVELES: NivelTriage[] = [1, 2, 3, 4, 5];

export function RevisionClinica({
  caso,
  detalle,
  onConfirmar,
  onVolver,
}: {
  caso: Caso;
  /** El motivo que dio core, palabra por palabra. */
  detalle: string;
  onConfirmar: (campos: CamposRevision) => void;
  onVolver: () => void;
}) {
  const [campos, setCampos] = useState<CamposRevision>(() => precargar(caso));
  const [signosTexto, setSignosTexto] = useState(campos.signosAlarma.join(", "));
  const [enviando, setEnviando] = useState(false);
  const faltas = faltantes(campos);

  function fijar<K extends keyof CamposRevision>(k: K, v: CamposRevision[K]) {
    setCampos((c) => ({ ...c, [k]: v }));
  }

  return (
    <section className="rounded-2xl border border-[color:var(--color-alerta)]/50 bg-[color:var(--color-superficie)] p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-[color:var(--color-alerta)]">
        <ClipboardCheck className="size-5" aria-hidden />
        Revisión clínica
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-[color:var(--color-texto-tenue)]">
        La extracción no alcanzó sola ({detalle}). Esto es lo que se entendió
        del dictado: corrígelo y confirma, o vuelve a dictar. Lo que confirmes
        queda registrado a tu nombre.
      </p>

      {/* El dictado literal, para corregir mirándolo y no de memoria. */}
      <blockquote className="mt-4 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] p-3 text-sm italic text-[color:var(--color-texto-tenue)]">
        "{caso.textoCrudo}"
      </blockquote>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
            Edad
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            value={campos.edad ?? ""}
            onChange={(e) =>
              fijar("edad", e.target.value === "" ? null : Number(e.target.value))
            }
            className="h-12 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3.5 text-base outline-none focus:border-[color:var(--color-info)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
            Sexo
          </span>
          <select
            value={campos.sexo}
            onChange={(e) => fijar("sexo", e.target.value as Sexo)}
            className="h-12 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3 text-base outline-none focus:border-[color:var(--color-info)]"
          >
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
            <option value="desconocido">No determinado</option>
          </select>
        </label>
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Triage
        </legend>
        <div className="grid grid-cols-5 gap-1.5">
          {NIVELES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={campos.triage === n}
              onClick={() => fijar("triage", n)}
              className={`min-h-12 rounded-xl border text-sm font-bold transition-colors ${
                campos.triage === n
                  ? "border-[color:var(--color-marca)] bg-[color:var(--color-marca)]/15 text-[color:var(--color-texto)]"
                  : "border-[color:var(--color-borde)] text-[color:var(--color-texto-tenue)]"
              }`}
            >
              {ETIQUETA_TRIAGE[n].split(" · ")[0]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Hallazgo principal
        </span>
        <input
          type="text"
          value={campos.hallazgo}
          onChange={(e) => fijar("hallazgo", e.target.value)}
          placeholder="Dolor torácico opresivo con irradiación"
          className="h-12 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3.5 text-base outline-none focus:border-[color:var(--color-info)]"
        />
      </label>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Signos de alarma <span className="normal-case">(separados por coma)</span>
        </span>
        <input
          type="text"
          value={signosTexto}
          onChange={(e) => {
            setSignosTexto(e.target.value);
            fijar("signosAlarma", partirSignos(e.target.value));
          }}
          placeholder="hipotensión, diaforesis"
          className="h-12 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3.5 text-base outline-none focus:border-[color:var(--color-info)]"
        />
      </label>

      {faltas.length > 0 && (
        <p className="mt-3 text-xs text-[color:var(--color-alerta)]">
          Para confirmar falta {faltas.join(" y ")}.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          disabled={faltas.length > 0 || enviando}
          onClick={() => {
            setEnviando(true);
            onConfirmar(campos);
          }}
          className="inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-[color:var(--color-marca)] px-4 font-semibold text-white disabled:opacity-40"
        >
          Confirmar y buscar hospital
        </button>
        <button
          type="button"
          onClick={onVolver}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[color:var(--color-borde)] px-4 text-sm font-semibold"
        >
          Volver al dictado
        </button>
      </div>
    </section>
  );
}
