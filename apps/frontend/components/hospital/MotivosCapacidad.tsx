"use client";

/**
 * Por qué esta sede no puede recibir.
 *
 * No es un "motivo de rechazo": es una DECLARACIÓN DE CAPACIDAD, y la
 * diferencia no es de vocabulario. La Ley 1751/2015 obliga a la atención
 * inicial de urgencias sin autorización previa, así que ningún hospital está
 * negando atención aquí — está reportando que no tiene con qué resolver este
 * caso, con fecha y hora.
 *
 * Cada una de estas respuestas alimenta el índice de congestión de la sede.
 * Es el sensor del producto: el jefe de urgencias no tipea nada, toca el botón
 * que de todas formas iba a tocar, y la red aprende.
 *
 * Por eso son opciones cerradas y no texto libre: un campo abierto da datos
 * que nadie puede agregar. Estas cuatro son las causas reales de rebote.
 */

const MOTIVOS = [
  "Sin camas UCI disponibles",
  "Sala de hemodinamia en procedimiento",
  "Urgencias en capacidad máxima",
  "Sin especialista de turno",
] as const;

export function MotivosCapacidad({
  onElegir,
  onCancelar,
}: {
  onElegir: (motivo: string) => void;
  onCancelar: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-[color:var(--color-texto-tenue)]">
        Declaración de capacidad. Queda auditada con fecha y hora.
      </p>

      {MOTIVOS.map((m) => (
        <button
          key={m}
          onClick={() => onElegir(m)}
          className="w-full px-3 rounded-lg text-sm text-left
                     bg-[color:var(--color-superficie-alta)]
                     border border-[color:var(--color-borde)]"
        >
          {m}
        </button>
      ))}

      <button
        onClick={onCancelar}
        className="w-full text-xs text-[color:var(--color-texto-tenue)]"
      >
        Volver
      </button>
    </div>
  );
}
