"use client";

/**
 * El histórico de un código, con el diff de cada salto.
 *
 * Es la vista que **prueba** la regla: el código es el mismo en todas las
 * filas, la etiqueta de cada versión sigue ahí, y se ve la fecha en que dejó
 * de regir. Sin esto, "editar una etiqueta no rompe el histórico" es una
 * afirmación; con esto es algo que se mira.
 */

import { describirDiferencia, type Historial as Datos } from "@/lib/catalogos-modelo";

export function Historial({ datos }: { datos: Datos }) {
  // De la más nueva a la más vieja: lo que se busca casi siempre es el último
  // cambio, y hacer scroll hasta abajo para encontrarlo es una fricción tonta.
  const versiones = [...datos.versiones].reverse();

  return (
    <ol className="space-y-3">
      {versiones.map((v) => {
        const indiceOriginal = datos.versiones.findIndex((x) => x.version === v.version);
        const cambios = datos.cambios[indiceOriginal] ?? [];
        const esVigente = v.version === datos.vigente.version;

        return (
          <li
            key={v.version}
            className={`rounded-lg border p-4 ${
              esVigente
                ? "border-[color:var(--color-info)]/50 bg-[color:var(--color-superficie-alta)]"
                : "border-[color:var(--color-borde)]"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="tabular text-sm font-semibold">v{v.version}</span>
              {esVigente && (
                <span className="rounded-full bg-[color:var(--color-info)]/15 px-2 py-0.5 text-[11px] font-medium text-[color:var(--color-info)]">
                  vigente
                </span>
              )}
              {!v.activo && (
                <span className="rounded-full bg-[color:var(--color-texto-tenue)]/15 px-2 py-0.5 text-[11px] font-medium text-[color:var(--color-texto-tenue)]">
                  retirada
                </span>
              )}
              <time
                dateTime={v.creadoEn}
                className="tabular text-xs text-[color:var(--color-texto-tenue)]"
              >
                {fecha(v.creadoEn)}
              </time>
              <span className="text-xs text-[color:var(--color-texto-tenue)]">
                {v.creadoPor}
              </span>
            </div>

            <p className="mt-2 text-sm">{v.etiqueta}</p>

            {v.motivo && (
              <p className="mt-1 text-xs italic text-[color:var(--color-texto-tenue)]">
                “{v.motivo}”
              </p>
            )}

            {cambios.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-[color:var(--color-borde)] pt-3">
                {cambios.map((c) => (
                  <li
                    key={c.campo}
                    className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-[color:var(--color-texto-tenue)]"
                  >
                    {describirDiferencia(c)}
                  </li>
                ))}
              </ul>
            )}

            {indiceOriginal === 0 && (
              <p className="mt-3 border-t border-[color:var(--color-borde)] pt-3 text-xs text-[color:var(--color-texto-tenue)]">
                Versión original. El código <code>{v.codigo}</code> no ha cambiado desde
                aquí — es lo que mantiene unida la serie histórica.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}
