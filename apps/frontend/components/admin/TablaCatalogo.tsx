"use client";

/**
 * Las entradas vigentes de un catálogo.
 *
 * El código va primero y en monoespaciada: es la columna que importa, la que
 * no cambia y la que se compara con el dataset. La etiqueta va después porque
 * es la que cambia.
 *
 * La tabla scrollea dentro de su propio contenedor. Sin eso, a 320 px la
 * página entera scrollea en horizontal y se pierde la cabecera.
 */

import { History } from "lucide-react";
import type { VersionEntrada } from "@/lib/catalogos-modelo";

export function TablaCatalogo({
  entradas,
  onVerHistorial,
  onNuevaVersion,
}: {
  entradas: VersionEntrada[];
  onVerHistorial: (codigo: string) => void;
  onNuevaVersion: (entrada: VersionEntrada) => void;
}) {
  if (entradas.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-texto-tenue)]">
        Este catálogo está vacío.
      </p>
    );
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-borde)] text-left">
            <Th>Código</Th>
            <Th>Etiqueta</Th>
            <Th className="text-right">Versión</Th>
            <Th>Estado</Th>
            <Th><span className="sr-only">Acciones</span></Th>
          </tr>
        </thead>
        <tbody>
          {entradas.map((e) => (
            <tr
              key={e.codigo}
              className="border-b border-[color:var(--color-borde)]/60 last:border-0"
            >
              <td className="py-2.5 pr-4 font-mono text-xs">{e.codigo}</td>
              <td className="py-2.5 pr-4">{e.etiqueta}</td>
              <td className="tabular py-2.5 pr-4 text-right text-[color:var(--color-texto-tenue)]">
                v{e.version}
              </td>
              <td className="py-2.5 pr-4">
                {e.activo ? (
                  <span className="text-[color:var(--color-estable)]">activa</span>
                ) : (
                  <span className="text-[color:var(--color-texto-tenue)]">retirada</span>
                )}
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onVerHistorial(e.codigo)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs text-[color:var(--color-texto-tenue)] hover:text-[color:var(--color-texto)]"
                >
                  <History className="size-3.5" aria-hidden />
                  Histórico
                </button>
                <button
                  type="button"
                  onClick={() => onNuevaVersion(e)}
                  className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs text-[color:var(--color-info)]"
                >
                  Nueva versión
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-[color:var(--color-texto-tenue)] ${className}`}
    >
      {children}
    </th>
  );
}
