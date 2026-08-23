"use client";

/**
 * Los cuatro botones. El control más usado de todo PULSO.
 *
 * ── POR QUÉ SON TAN GRANDES ───────────────────────────────────────
 * Esta pantalla se abre 20 veces por turno, a las 3 de la mañana, con guantes,
 * a veces caminando. Cada milímetro que se le quita a un botón es una
 * declaración que no se hace, y una declaración que no se hace es un ranking
 * que sigue mandando pacientes con un snapshot del 2022. 88 px de alto no es
 * generosidad: es la diferencia entre que el modelo de capacidad declarada
 * exista o no.
 *
 * ── POR QUÉ CADA UNO DICE SU CONSECUENCIA ─────────────────────────
 * "Saturado" y "cerrado" suenan parecido y hacen lo mismo al ranking; lo que
 * cambia es lo que significan para quien lo lea después en la auditoría.
 * Debajo del grupo se dice qué le pasa a la sede con el estado que está
 * puesto, en una frase.
 *
 * ── POR QUÉ CADA UNO TIENE FORMA ADEMÁS DE COLOR ──────────────────
 * Con el brillo al mínimo el color se pierde, y quien no distingue rojo de
 * verde tiene el mismo derecho a saber en qué estado está su sede. El glifo va
 * en el modelo (`PINTA_ESTADO`) para que no se pueda pintar uno sin el otro.
 */

import {
  CONSECUENCIA_ESTADO,
  ESTADOS_OPERATIVOS,
  ETIQUETA_ESTADO,
  PINTA_ESTADO,
  type EstadoOperativo,
} from "@/lib/capacidad-modelo";

export function BotonesEstado({
  actual,
  pendiente,
  deshabilitado,
  onElegir,
}: {
  /** null = no se sabe. NO se pinta ninguno seleccionado: no se asume nada. */
  actual: EstadoOperativo | null;
  /** Se tocó y core no ha confirmado. Se dice, no se disimula. */
  pendiente: boolean;
  deshabilitado: boolean;
  onElegir: (estado: EstadoOperativo) => void;
}) {
  return (
    <section aria-labelledby="titulo-estado">
      <h2 id="titulo-estado" className="text-sm font-semibold mb-2">
        Estado operativo
      </h2>

      {/* Dos columnas: en 320 px cada botón queda en ~140 px y el texto más
          largo ("Contingencia") entra sin partirse ni desbordar. */}
      <div className="grid grid-cols-2 gap-2">
        {ESTADOS_OPERATIVOS.map((estado) => {
          const activo = actual === estado;
          const { color, glifo } = PINTA_ESTADO[estado];

          return (
            <button
              key={estado}
              type="button"
              onClick={() => onElegir(estado)}
              disabled={deshabilitado}
              aria-pressed={activo}
              className="min-h-[88px] rounded-xl px-2 py-3 flex flex-col items-center
                         justify-center gap-1 border-2 font-semibold
                         disabled:opacity-40"
              style={{
                borderColor: color,
                // El activo va relleno y el resto en contorno: en una rejilla
                // de cuatro, "cuál está puesto" se tiene que ver de un vistazo
                // desde un metro, no leyendo.
                background: activo ? color : "transparent",
                color: activo ? "#0a0e14" : color,
              }}
            >
              <span aria-hidden className="text-xl leading-none">
                {glifo}
              </span>
              <span className="text-base leading-tight text-center">
                {ETIQUETA_ESTADO[estado]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-sm text-[color:var(--color-texto)]">
        {actual ? (
          <>
            {CONSECUENCIA_ESTADO[actual]}
            {pendiente && (
              <span className="text-[color:var(--color-alerta)]">
                {" "}
                · sin confirmar por core
              </span>
            )}
          </>
        ) : (
          "Core no dice en qué estado está esta sede. Declara uno."
        )}
      </p>
    </section>
  );
}
