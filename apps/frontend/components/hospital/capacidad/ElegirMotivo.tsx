"use client";

/**
 * El segundo toque. Y no hay un tercero.
 *
 * Sacar una sede del ranking sin decir por qué es una decisión que nadie puede
 * auditar después, y es justo el texto que `/campo` va a pintar en la tarjeta
 * gris ("Declaró contingencia hace 12 min"). Por eso el motivo es obligatorio
 * — pero por eso mismo tiene que costar exactamente un toque.
 *
 * ── POR QUÉ NO SE REUSA `components/hospital/MotivosCapacidad.tsx` ─
 * Ese componente responde a otra pregunta: por qué esta sede no puede recibir
 * A ESTE PACIENTE ("sin especialista de turno", "hemodinamia en
 * procedimiento"). Aquí la pregunta es por qué la sede entera está fuera, y
 * las causas son otras: falla de servicios públicos, emergencia interna,
 * cierre ordenado. Mezclarlas daría una lista larga donde ninguna de las dos
 * se elige rápido. Las dos listas viven donde se usan.
 *
 * "Otro" declara igual, en el mismo toque. No abre un teclado: a las 3 a.m.
 * un campo obligatorio de texto es cómo se pierde una declaración entera. El
 * detalle se puede añadir después, sin bloquear nada.
 */

import { motivosDe, ETIQUETA_ESTADO, PINTA_ESTADO, type EstadoOperativo } from "@/lib/capacidad-modelo";

export function ElegirMotivo({
  estado,
  onElegir,
  onCancelar,
}: {
  estado: Exclude<EstadoOperativo, "recibiendo">;
  onElegir: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const { color } = PINTA_ESTADO[estado];

  return (
    <div
      className="mt-3 rounded-xl border-2 p-3"
      style={{ borderColor: color }}
      role="group"
      aria-label={`Motivo de ${ETIQUETA_ESTADO[estado]}`}
    >
      <p className="text-sm font-semibold mb-2">
        ¿Por qué {ETIQUETA_ESTADO[estado].toLowerCase()}?
      </p>
      <p className="text-xs text-[color:var(--color-texto-tenue)] mb-3">
        Un toque y queda declarado. El motivo es lo que ve el paramédico y lo
        que queda en la auditoría.
      </p>

      <div className="space-y-2">
        {motivosDe(estado).map((motivo) => (
          <button
            key={motivo}
            type="button"
            onClick={() => onElegir(motivo)}
            className="w-full min-h-14 rounded-lg px-3 text-left font-medium
                       bg-[color:var(--color-superficie-alta)]
                       border border-[color:var(--color-borde)]"
          >
            {motivo}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCancelar}
        className="mt-2 w-full min-h-14 rounded-lg px-3
                   text-[color:var(--color-texto-tenue)]"
      >
        Volver sin declarar
      </button>
    </div>
  );
}
