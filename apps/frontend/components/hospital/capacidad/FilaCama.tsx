"use client";

/**
 * Una fila por tipo de cama: `−`  número  `+`.
 *
 * ── NADA DE TECLADO ───────────────────────────────────────────────
 * Un `<input type="number">` en un móvil abre el teclado numérico, tapa media
 * pantalla, exige apuntar a un campo de 20 px con guantes y encima admite
 * "14" donde se quería "4". Dos botones de 56 px cubren el 95 % del uso real
 * —subir o bajar de a una cama según entra o sale un paciente— y no admiten
 * un valor imposible.
 *
 * ── Y NADA DE "GUARDAR" ───────────────────────────────────────────
 * Cada fila guarda sola. Un botón de guardar al final es un paso más y a las
 * 3 a.m. se olvida: el número queda cambiado en la pantalla y sin cambiar en
 * el ranking, que es peor que no haberlo tocado.
 *
 * Los toques se agrupan 700 ms en `useDeclaracion` — subir de 2 a 6 manda un
 * PUT, no cuatro.
 */

import {
  ajustarDisponibles,
  nombreCama,
  puedeAjustar,
  type FilaCama as Fila,
} from "@/lib/capacidad-modelo";
import { AvisoReversion } from "./AvisoReversion";

export function FilaCama({
  fila,
  deshabilitada,
  onFijar,
  onReintentar,
  onDescartar,
}: {
  fila: Fila;
  deshabilitada: boolean;
  onFijar: (disponibles: number) => void;
  onReintentar: () => void;
  onDescartar: () => void;
}) {
  const paso = (delta: number) => {
    if (!puedeAjustar(fila.disponibles, delta, fila.total)) return;
    onFijar(ajustarDisponibles(fila.disponibles, delta, fila.total));
  };

  const nombre = nombreCama(fila.tipo);

  return (
    <li className="rounded-xl border border-[color:var(--color-borde)] p-2">
      <div className="flex items-center gap-2">
        {/* min-w-0 + truncate: sin esto un nombre REPS largo empuja los botones
            fuera de la pantalla en 320 px. */}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{nombre}</p>
          <p className="text-xs text-[color:var(--color-texto-tenue)]">
            {fila.total === null ? "total no publicado" : `de ${fila.total} habilitadas`}
            {fila.pendiente && (
              <span className="text-[color:var(--color-alerta)]"> · guardando…</span>
            )}
          </p>
        </div>

        <Paso
          etiqueta={`Una cama menos de ${nombre}`}
          glifo="−"
          onClick={() => paso(-1)}
          deshabilitado={deshabilitada || !puedeAjustar(fila.disponibles, -1, fila.total)}
        />

        <output
          aria-label={`${nombre}: ${fila.disponibles} disponibles`}
          className="tabular text-3xl font-bold text-center min-w-[3ch]"
          style={{
            // El número pendiente se pinta en ámbar: es un dato que todavía no
            // es cierto en el servidor, y se ve distinto de uno que sí lo es.
            color: fila.pendiente ? "var(--color-alerta)" : "var(--color-texto)",
          }}
        >
          {fila.disponibles}
        </output>

        <Paso
          etiqueta={`Una cama más de ${nombre}`}
          glifo="+"
          onClick={() => paso(1)}
          deshabilitado={deshabilitada || !puedeAjustar(fila.disponibles, 1, fila.total)}
        />
      </div>

      {fila.revertido && (
        <AvisoReversion
          mensaje={fila.revertido.mensaje}
          onReintentar={onReintentar}
          onCerrar={onDescartar}
        />
      )}
    </li>
  );
}

/** 56 × 56 px exactos. Es el mínimo con guantes, y aquí no se negocia. */
function Paso({
  etiqueta,
  glifo,
  onClick,
  deshabilitado,
}: {
  etiqueta: string;
  glifo: string;
  onClick: () => void;
  deshabilitado: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      className="h-14 w-14 shrink-0 rounded-xl text-2xl font-bold
                 bg-[color:var(--color-superficie-alta)]
                 border border-[color:var(--color-borde)]
                 disabled:opacity-30"
    >
      <span aria-hidden>{glifo}</span>
    </button>
  );
}
