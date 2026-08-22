"use client";

/**
 * Lo que el parser clínico entendió del dictado.
 *
 * Se muestra ANTES del ranking a propósito: el paramédico tiene que poder
 * desmentirlo de un vistazo. Si el sistema entendió mal, mejor que se vea
 * aquí y no cuando la ambulancia ya arrancó.
 *
 * La confianza se pinta en rojo por debajo de 0.5 — es la regla del carril
 * de Neid: no presentamos como certeza lo que es una suposición. Un 0.35
 * exacto significa que corrió el extractor heurístico, no el LLM.
 */

import type { Caso } from "@/lib/types";
import { ETIQUETA_TRIAGE, esHoraDorada, nombresServicios } from "@/lib/presentacion";

const CONFIANZA_BAJA = 0.5;

export function TarjetaCaso({ caso }: { caso: Caso }) {
  const critico = esHoraDorada(caso.triage);
  const dudoso = caso.confianza < CONFIANZA_BAJA;

  return (
    <section
      className={`mb-4 p-4 rounded-xl border ${
        critico
          ? "border-[color:var(--color-critico)]/50 bg-[color:var(--color-critico)]/10"
          : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-bold">
          {critico && <span aria-hidden>🔴 </span>}
          Triage {ETIQUETA_TRIAGE[caso.triage]}
        </span>
        <span className="text-xs text-[color:var(--color-texto-tenue)] shrink-0">
          {caso.tipoMovil} · confianza{" "}
          <span
            className={dudoso ? "font-bold text-[color:var(--color-alerta)]" : undefined}
          >
            {(caso.confianza * 100).toFixed(0)}%
          </span>
        </span>
      </div>

      <p className="text-sm mb-2">{caso.resumen}</p>

      <dl className="text-xs space-y-1 text-[color:var(--color-texto-tenue)]">
        <div>
          <span className="font-semibold">Dx:</span> {caso.dxDescripcion}
          {caso.dxCie10 && ` (${caso.dxCie10})`}
        </div>
        <div>
          <span className="font-semibold">Requiere:</span>{" "}
          {caso.serviciosRequeridos.length
            ? nombresServicios(caso.serviciosRequeridos)
            : "solo urgencias"}
        </div>
        {caso.signosAlarma.length > 0 && (
          <div>
            <span className="font-semibold">Alarma:</span>{" "}
            {caso.signosAlarma.join(" · ")}
          </div>
        )}
      </dl>

      {dudoso && (
        <p className="mt-3 pt-3 border-t border-[color:var(--color-borde)] text-xs text-[color:var(--color-alerta)]">
          Extracción de baja confianza. Verifica el dictado antes de despachar.
        </p>
      )}
    </section>
  );
}
