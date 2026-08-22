"use client";

/**
 * Qué móvil es este.
 *
 * Aparece una vez, al abrir la consola por primera vez en un dispositivo, y
 * después solo si alguien toca el identificador en la barra. El tablet de una
 * ambulancia no cambia de móvil todos los días.
 *
 * ── POR QUÉ SE PUEDE SALTAR ───────────────────────────────────────
 * Porque un caso se puede atender sin declarar el móvil, y bloquear la consola
 * con un formulario mientras hay un paciente en la camilla sería exactamente
 * el tipo de fricción que este producto dice eliminar. Sin unidad el flujo
 * funciona igual; lo único que pierde es que el regulador del CRUE vea quién
 * pregunta.
 *
 * No es autenticación — ver `lib/unidad.ts`.
 */

import { useState } from "react";
import { EJEMPLO_ID, normalizarId } from "@/lib/unidad";

export function SelectorUnidad({
  actual,
  onGuardar,
  onCerrar,
}: {
  actual: { id: string; tripulante?: string } | null;
  onGuardar: (id: string, tripulante?: string) => void;
  onCerrar: () => void;
}) {
  const [id, setId] = useState(actual?.id ?? "");
  const [tripulante, setTripulante] = useState(actual?.tripulante ?? "");

  const limpio = normalizarId(id);
  const valido = limpio.length >= 3;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-unidad"
        className="w-full max-w-sm p-5 rounded-3xl
                   bg-[color:var(--color-superficie)]
                   border border-[color:var(--color-borde)]"
      >
        <h2 id="titulo-unidad" className="text-lg font-bold">
          ¿Qué unidad eres?
        </h2>
        <p className="mt-1 text-xs text-[color:var(--color-texto-tenue)]">
          El regulador del CRUE lo ve junto a tus casos, para saber a qué móvil
          llamar. Se guarda solo en este dispositivo.
        </p>

        <label className="mt-4 block text-xs font-semibold">
          Identificador del móvil
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder={EJEMPLO_ID}
            // Sin autocorrección: "AMB-014" no es una palabra y el teclado del
            // móvil intentaría arreglarlo.
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="mt-1 w-full p-3 rounded-xl tabular uppercase
                       bg-[color:var(--color-fondo)]
                       border border-[color:var(--color-borde)]
                       focus:outline-none focus:border-[color:var(--color-info)]"
          />
        </label>

        <label className="mt-3 block text-xs font-semibold">
          Tripulante <span className="font-normal opacity-60">(opcional)</span>
          <input
            value={tripulante}
            onChange={(e) => setTripulante(e.target.value)}
            placeholder="Quién opera"
            className="mt-1 w-full p-3 rounded-xl
                       bg-[color:var(--color-fondo)]
                       border border-[color:var(--color-borde)]
                       focus:outline-none focus:border-[color:var(--color-info)]"
          />
        </label>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onCerrar}
            className="flex-1 min-h-12 rounded-xl border border-[color:var(--color-borde)]"
          >
            {actual ? "Cancelar" : "Ahora no"}
          </button>
          <button
            onClick={() => valido && onGuardar(limpio, tripulante || undefined)}
            disabled={!valido}
            className="flex-[2] min-h-12 rounded-xl font-semibold
                       bg-[color:var(--color-info)] text-[#04121f]
                       disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
