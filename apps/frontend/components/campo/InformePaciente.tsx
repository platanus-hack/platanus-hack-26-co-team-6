"use client";

/**
 * El informe del paciente: lo que el sistema entendió del dictado.
 *
 * Sale solo, en cuanto termina el dictado, y va **encima del ranking** a
 * propósito. El paramédico tiene que poder desmentirlo de un vistazo: si el
 * parser entendió "hemiparesia derecha" donde se dijo "izquierda", mejor que
 * se vea aquí y no cuando la ambulancia ya arrancó hacia el hospital
 * equivocado. Por eso el orden es informe → candidatos → despachar, y no al
 * revés.
 *
 * ── LA CONFIANZA NO SE ESCONDE ────────────────────────────────────
 * Por debajo de 0.5 el informe entero se marca. Un 0.35 exacto significa algo
 * concreto: corrió el extractor heurístico, no el modelo — es el valor que la
 * degradación documentada del repo usa cuando `ai-core` no responde. No es lo
 * mismo "el modelo no está seguro" que "no hubo modelo", y se dice cuál es.
 *
 * ── LOS HUECOS SE DECLARAN ────────────────────────────────────────
 * Al final hay un bloque con lo que este informe NO sabe: quién es el paciente
 * y con qué EPS está afiliado. PULSO es seudónimo por diseño — nunca pide
 * nombre ni documento— y eso tiene un precio que es más honesto enseñar que
 * disimular. Ver `docs/tareas/juan.md` §4.8: `PatientRDA` es un hueco
 * declarado, no un dato que rellenar.
 */

import { AlertTriangle } from "lucide-react";
import type { Caso } from "@/lib/types";
import {
  ETIQUETA_TRIAGE,
  esHoraDorada,
  nombreServicio,
} from "@/lib/presentacion";

/** Por debajo de esto, la UI pide confirmación en vez de presentar certeza. */
const CONFIANZA_BAJA = 0.5;
/** El valor exacto de la heurística cuando no hubo modelo. */
const CONFIANZA_HEURISTICA = 0.35;

export function InformePaciente({ caso }: { caso: Caso }) {
  const critico = esHoraDorada(caso.triage);
  const dudoso = caso.confianza < CONFIANZA_BAJA;
  const sinModelo = Math.abs(caso.confianza - CONFIANZA_HEURISTICA) < 0.001;

  return (
    <section
      aria-label="Informe del paciente"
      className={`mb-4 overflow-hidden rounded-2xl border ${
        critico
          ? "border-[color:var(--color-critico)]/50"
          : "border-[color:var(--color-borde)]"
      } bg-[color:var(--color-superficie)]`}
    >
      <header
        className={`flex items-start justify-between gap-3 px-5 py-4 ${
          critico ? "bg-[color:var(--color-critico)]/10" : ""
        }`}
      >
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
            Informe del paciente
          </p>
          <h2 className="mt-0.5 text-lg font-bold leading-tight">
            {caso.dxDescripcion}
          </h2>
          {caso.dxCie10 && (
            <p className="mt-0.5 text-xs text-[color:var(--color-texto-tenue)]">
              CIE-10 <span className="tabular">{caso.dxCie10}</span>
            </p>
          )}
        </div>

        <span
          className="shrink-0 rounded-xl border px-2.5 py-1.5 text-center text-xs font-bold"
          style={{
            borderColor: critico ? "var(--color-critico)" : "var(--color-borde)",
            color: critico ? "var(--color-critico)" : "var(--color-texto)",
          }}
        >
          Triage {ETIQUETA_TRIAGE[caso.triage]}
        </span>
      </header>

      <div className="px-5 pb-5">
        <p className="text-sm leading-relaxed">{caso.resumen}</p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Dato rotulo="Edad">
            {caso.edad === null ? "no referida" : `${caso.edad} años`}
          </Dato>
          <Dato rotulo="Sexo">
            {caso.sexo === "M"
              ? "Masculino"
              : caso.sexo === "F"
                ? "Femenino"
                : "no referido"}
          </Dato>
          <Dato rotulo="Móvil">
            {caso.tipoMovil}
            {caso.requiereMedicoABordo ? " · médico a bordo" : ""}
          </Dato>
          <Dato rotulo="Complejidad">{caso.complejidadRequerida}</Dato>
        </dl>

        {caso.signosAlarma.length > 0 && (
          <div className="mt-4">
            <Rotulo>Signos de alarma</Rotulo>
            <ul className="flex flex-wrap gap-1.5">
              {caso.signosAlarma.map((s) => (
                <li
                  key={s}
                  className="rounded-lg border border-[color:var(--color-critico)]/40 bg-[color:var(--color-critico)]/10 px-2 py-1 text-xs text-[color:var(--color-critico)]"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <Rotulo>La sede tiene que tener habilitado</Rotulo>
          {caso.serviciosRequeridos.length === 0 ? (
            <p className="text-sm text-[color:var(--color-texto-tenue)]">
              Solo urgencias.
            </p>
          ) : (
            <ul className="space-y-1">
              {caso.serviciosRequeridos.map((cod) => (
                <li key={cod} className="flex items-baseline gap-2 text-sm">
                  <span className="tabular text-xs text-[color:var(--color-texto-tenue)]">
                    {cod}
                  </span>
                  {nombreServicio(cod)}
                </li>
              ))}
            </ul>
          )}
          {/* Es el filtro duro del ranking, no una sugerencia. Decirlo evita
              la pregunta "¿y por qué no sale el hospital de al lado?". */}
          <p className="mt-1.5 text-[11px] text-[color:var(--color-texto-tenue)]">
            Códigos REPS. Una sede sin ellos no aparece en el ranking.
          </p>
        </div>

        <div className="mt-4 border-t border-[color:var(--color-borde)] pt-4">
          <Rotulo>Lo que este informe no sabe</Rotulo>
          <p className="text-xs leading-relaxed text-[color:var(--color-texto-tenue)]">
            <strong className="font-semibold text-[color:var(--color-texto)]">
              Identidad y afiliación.
            </strong>{" "}
            PULSO no pide nombre ni documento: el caso viaja seudónimo. Eso
            protege al paciente y deja fuera la EPS, el régimen y los
            procedimientos facturables.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--color-borde)] pt-3">
          <span className="text-xs text-[color:var(--color-texto-tenue)]">
            Confianza de la extracción
          </span>
          <span
            className={`tabular text-sm font-bold ${
              dudoso
                ? "text-[color:var(--color-alerta)]"
                : "text-[color:var(--color-estable)]"
            }`}
          >
            {(caso.confianza * 100).toFixed(0)}%
          </span>
        </div>

        {dudoso && (
          <p className="mt-2 flex gap-2 rounded-xl border border-[color:var(--color-alerta)]/40 bg-[color:var(--color-alerta)]/10 px-3 py-2.5 text-xs leading-relaxed text-[color:var(--color-alerta)]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
            <span>
              {sinModelo
                ? "Esto no lo extrajo un modelo: lo dedujo una tabla de palabras clave, porque ai-core no respondió. Léelo entero antes de despachar."
                : "Extracción de baja confianza. Verifica el dictado antes de despachar."}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
      {children}
    </p>
  );
}

function Dato({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-[color:var(--color-texto-tenue)]">{rotulo}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
