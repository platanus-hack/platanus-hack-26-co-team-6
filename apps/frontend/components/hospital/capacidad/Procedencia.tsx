"use client";

/**
 * De dónde salió lo que estás viendo, y hasta cuándo vale.
 *
 * Va arriba del todo y ocupa espacio a propósito: son las dos preguntas que
 * hay que poder contestar sin buscarlas. "Declarado por ti hace 12 min" y
 * "Snapshot REPS 2022" **no se pintan igual** — es la misma honestidad de
 * `GET /capacidades`, aplicada a las camas.
 *
 * La caducidad está aquí y no escondida en un pie: una declaración que no
 * caduca queda para siempre y nadie la revierte. Si en dos semanas media red
 * está en contingencia permanente, es porque esta línea no se vio.
 */

import {
  rotuloCaducidad,
  type Caducidad,
  type RotuloProcedencia,
} from "@/lib/capacidad-modelo";

const TONO: Record<RotuloProcedencia["tono"], { color: string; glifo: string }> = {
  declarada: { color: "var(--color-estable)", glifo: "●" },
  vieja: { color: "var(--color-alerta)", glifo: "▲" },
  ausente: { color: "var(--color-critico)", glifo: "■" },
};

export function Procedencia({
  procedencia,
  caducidad,
  onRecargar,
}: {
  procedencia: RotuloProcedencia;
  caducidad: Caducidad | null;
  onRecargar: () => void;
}) {
  const { color, glifo } = TONO[procedencia.tono];

  // La caducidad solo se muestra cuando hay algo declarado que pueda caducar.
  // Debajo de un "Snapshot REPS 2022" la frase sobra: el snapshot no vence, ya
  // venció hace cuatro años y eso lo dice el rótulo de arriba.
  const muestraCaducidad = procedencia.tono === "declarada";

  const tonoCaducidad = !caducidad
    ? "var(--color-alerta)"
    : caducidad.vencida
      ? "var(--color-critico)"
      : caducidad.cerca
        ? "var(--color-alerta)"
        : "var(--color-texto)";

  return (
    <section
      aria-label="Procedencia del dato"
      className="rounded-xl p-3 mb-4 border"
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <p className="flex items-start gap-2 font-semibold">
        <span aria-hidden style={{ color }}>
          {glifo}
        </span>
        <span className="flex-1 min-w-0" style={{ color }}>
          {procedencia.texto}
        </span>
      </p>

      <p className="mt-1 text-sm text-[color:var(--color-texto)]">
        {procedencia.detalle}
      </p>

      {muestraCaducidad && (
        <p
          className="mt-2 text-sm font-semibold tabular"
          style={{ color: tonoCaducidad }}
        >
          <span aria-hidden>⏱ </span>
          {rotuloCaducidad(caducidad)}
          {caducidad?.vencida && " Vuelve a declarar para que el ranking lo respete."}
        </p>
      )}

      {procedencia.tono === "ausente" && (
        <button
          type="button"
          onClick={onRecargar}
          className="mt-3 min-h-14 w-full rounded-lg px-3 font-semibold
                     border border-[color:var(--color-borde)]
                     bg-[color:var(--color-superficie-alta)]"
        >
          Reintentar la lectura
        </button>
      )}
    </section>
  );
}
