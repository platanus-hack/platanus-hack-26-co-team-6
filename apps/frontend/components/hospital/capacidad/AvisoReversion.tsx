"use client";

/**
 * "Esto no se guardó."
 *
 * Es la otra mitad del optimismo. Pintar el cambio antes de que el servidor
 * conteste es lo que hace que la pantalla se sienta instantánea; no decir nada
 * cuando el servidor lo rechaza es lo que la convierte en una mentira. El
 * número ya volvió solo a lo último confirmado — esto explica por qué se movió.
 *
 * Lleva reintentar porque el fallo más probable es de red y el valor que se
 * quería poner ya se conoce: obligar a volver a tocarlo todo con guantes, a las
 * 3 a.m., es cómo se pierde una declaración.
 */

export function AvisoReversion({
  mensaje,
  onReintentar,
  onCerrar,
}: {
  mensaje: string;
  onReintentar: () => void;
  onCerrar: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-2 rounded-lg p-3 text-sm
                 bg-[color:var(--color-critico)]/15
                 border border-[color:var(--color-critico)]/50"
    >
      <p className="flex items-start gap-2">
        <span aria-hidden className="text-[color:var(--color-critico)]">
          ↩
        </span>
        <span className="flex-1 min-w-0">{mensaje}</span>
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onReintentar}
          className="min-h-14 flex-1 rounded-lg px-3 font-semibold
                     bg-[color:var(--color-critico)] text-[#0a0e14]"
        >
          Reintentar
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-14 rounded-lg px-4
                     border border-[color:var(--color-borde)]"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
