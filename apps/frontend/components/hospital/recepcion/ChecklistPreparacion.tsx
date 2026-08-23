"use client";

/**
 * El checklist de preparación: lo único accionable de esta pantalla.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  CONFIRMAR ES UN ACTO HUMANO REGISTRADO — NO UN ESTADO DE LA UI
 * ═══════════════════════════════════════════════════════════════════
 *  Regla 6 del repo: PULSO propone, el humano decide, y nada con consecuencia
 *  clínica ocurre sin confirmación humana registrada. Por eso aquí NO hay
 *  actualización optimista: la casilla no se marca hasta que core devuelve
 *  QUIÉN confirmó y CUÁNDO.
 *
 *  Parece un detalle de UX y no lo es. Una casilla que se pinta sola y luego
 *  falla en silencio deja al hospital creyendo que la sala de hemodinamia está
 *  lista cuando nadie la preparó. Prefiero medio segundo de "confirmando…" a
 *  un ✓ que no respalda nadie.
 *
 *  Y por eso también se muestra el nombre al lado del ✓: un checklist sin
 *  autor no es auditoría, es decoración.
 */

import { Check, ClipboardCheck } from "lucide-react";
import { hace, type ItemChecklist } from "@/lib/recepcion-modelo";

export function ChecklistPreparacion({
  items,
  enCurso,
  puedeConfirmar,
  motivoBloqueo,
  ahora,
  onConfirmar,
}: {
  items: ItemChecklist[];
  /** id del ítem que está esperando respuesta de core. */
  enCurso: string | null;
  puedeConfirmar: boolean;
  /** Por qué no se puede confirmar. Se dice; no se esconde el botón sin más. */
  motivoBloqueo: string | null;
  ahora: number;
  onConfirmar: (itemId: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-texto-tenue)]">
        <ClipboardCheck className="size-4 shrink-0" strokeWidth={2.4} />
        Preparación
      </h2>

      {items.length === 0 ? (
        <p className="mt-3 text-[clamp(0.9rem,2vw,1.05rem)] text-[color:var(--color-texto-tenue)]">
          Este caso no trae checklist. Lo arma el catálogo de protocolos en el
          instante del &laquo;Aceptar&raquo; (tarea 4.1) y todavía no existe:
          coordine la preparación por los canales de siempre.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[color:var(--color-borde)]">
          {items.map((item) => (
            <Fila
              key={item.id}
              item={item}
              esperando={enCurso === item.id}
              puedeConfirmar={puedeConfirmar}
              ahora={ahora}
              onConfirmar={() => onConfirmar(item.id)}
            />
          ))}
        </ul>
      )}

      {motivoBloqueo && items.length > 0 && (
        <p className="mt-4 rounded-xl border border-[color:var(--color-alerta)]/40 bg-[color:var(--color-alerta)]/10 p-3 text-xs sm:text-sm text-[color:var(--color-alerta)]">
          {motivoBloqueo}
        </p>
      )}
    </section>
  );
}

function Fila({
  item,
  esperando,
  puedeConfirmar,
  ahora,
  onConfirmar,
}: {
  item: ItemChecklist;
  esperando: boolean;
  puedeConfirmar: boolean;
  ahora: number;
  onConfirmar: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-lg border-2"
        style={
          item.confirmado
            ? {
                background: "var(--color-estable)",
                borderColor: "var(--color-estable)",
              }
            : { borderColor: "var(--color-borde)" }
        }
      >
        {item.confirmado && (
          <Check className="size-5 text-[#04231d]" strokeWidth={3} />
        )}
      </span>

      <div className="min-w-0 flex-1 basis-40">
        <p className="text-[clamp(0.95rem,2.1vw,1.2rem)] font-semibold leading-tight break-words">
          {item.etiqueta}
        </p>

        {/* Quién y hace cuánto. Sin las dos cosas, un ✓ no dice nada: puede ser
            de hace treinta segundos o de hace dos horas, y en urgencias eso es
            la diferencia entre una sala lista y una sala que alguien creyó
            haber dejado lista. */}
        <p className="mt-0.5 text-[11px] sm:text-xs text-[color:var(--color-texto-tenue)]">
          {item.confirmado ? (
            <>
              <span className="text-[color:var(--color-estable)]">
                Confirmó {item.confirmadoPor ?? "un actor sin nombre"}
              </span>
              {item.confirmadoEn ? ` · ${hace(item.confirmadoEn, ahora)}` : ""}
            </>
          ) : (
            <>
              Sin confirmar
              {item.responsable ? ` · responsable: ${item.responsable}` : ""}
            </>
          )}
        </p>
      </div>

      {!item.confirmado && (
        <button
          onClick={onConfirmar}
          disabled={esperando || !puedeConfirmar}
          className="min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold
                     bg-[color:var(--color-superficie-alta)]
                     border border-[color:var(--color-borde)]
                     disabled:opacity-40"
        >
          {esperando ? "Confirmando…" : "Confirmar"}
        </button>
      )}
    </li>
  );
}
