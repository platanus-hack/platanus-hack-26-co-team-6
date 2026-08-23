"use client";

/**
 * Por qué sede estás declarando.
 *
 * Con actor real (1.3) esto no debería existir: la sesión trae `sedes[]` y la
 * pantalla abre directo en la suya. Existe porque HOY core corre con la
 * contraseña de turno compartida, la sesión no dice de qué hospital eres, y la
 * alternativa era elegir una sede por ti — que es exactamente el fallo que
 * `AGENTS.md` señala en la fila "una contraseña compartida abre las tres
 * consolas".
 *
 * Así que se pregunta, y se dice por qué se está preguntando. Cuando 1.3 esté
 * en todos los entornos, esta lista se reduce sola a las sedes del actor y el
 * aviso desaparece con ella.
 *
 * La lista sale de `GET /estado` (`congestion[]`), que es lo único que core
 * expone hoy con código y nombre de sede. Cuando exista `GET /sedes`, viene de
 * ahí.
 */

import type { CongestionSede } from "@/lib/types";

export function SelectorSede({
  sedes,
  actual,
  cargando,
  restringida,
  onElegir,
}: {
  sedes: CongestionSede[];
  actual: string | null;
  cargando: boolean;
  /** true si la lista ya viene acotada por el alcance del actor. */
  restringida: boolean;
  onElegir: (codigo: string) => void;
}) {
  const elegida = sedes.find((s) => s.codigo === actual) ?? null;

  return (
    <section aria-labelledby="titulo-sede" className="mb-4">
      <h2 id="titulo-sede" className="text-sm font-semibold mb-2">
        Sede
      </h2>

      {!restringida && (
        <p className="text-xs text-[color:var(--color-alerta)] mb-2">
          ▲ Tu sesión no dice de qué sede eres: la contraseña de turno es
          compartida. Elige tú, y revisa que sea la tuya antes de declarar.
        </p>
      )}

      {elegida ? (
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 font-semibold truncate">{elegida.nombre}</p>
          <button
            type="button"
            onClick={() => onElegir("")}
            className="min-h-14 shrink-0 rounded-lg px-4
                       border border-[color:var(--color-borde)]"
          >
            Cambiar
          </button>
        </div>
      ) : cargando ? (
        <p className="text-sm text-[color:var(--color-texto-tenue)]">
          Pidiendo la lista de sedes a core…
        </p>
      ) : sedes.length === 0 ? (
        <p className="text-sm text-[color:var(--color-critico)]">
          Core no devolvió ninguna sede. Sin eso no se puede declarar por
          ninguna: la pantalla no inventa un código de habilitación.
        </p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {sedes.map((sede) => (
            <li key={sede.codigo}>
              <button
                type="button"
                onClick={() => onElegir(sede.codigo)}
                className="w-full min-h-14 rounded-lg px-3 py-2 text-left
                           bg-[color:var(--color-superficie-alta)]
                           border border-[color:var(--color-borde)]"
              >
                <span className="block font-medium">{sede.nombre}</span>
                <span className="block text-xs tabular text-[color:var(--color-texto-tenue)]">
                  {sede.codigo}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
