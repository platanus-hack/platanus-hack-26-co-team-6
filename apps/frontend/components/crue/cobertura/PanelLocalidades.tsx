"use client";

/**
 * La flota por localidad, en texto.
 *
 * El mapa contesta "¿dónde están?"; esta lista contesta "¿cuántos hay en cada
 * zona y en qué estado?", que es la pregunta con la que el regulador decide a
 * quién llamar. Y es la vista que sobrevive sin Mapbox: sin token el mapa
 * degrada y esto sigue siendo utilizable.
 *
 * ── EL LÍMITE ─────────────────────────────────────────────────────
 * Aquí no hay ni habrá un botón de "reubicar" o "asignar". PULSO le MUESTRA la
 * cobertura al CRUE; regular la flota es su función legal (Res. 1220/2010) y
 * un botón que insinúe lo contrario debilita el argumento del producto.
 */

import {
  antiguedadS,
  frescuraDe,
  textoAntiguedad,
  textoPrecision,
  type GrupoLocalidad,
  type MovilCobertura,
} from "@/lib/posicion-modelo";

interface Props {
  grupos: GrupoLocalidad[];
  /** Reloj de la consola. null antes de montar. */
  ahora: number | null;
  /** Centrar el mapa en este móvil. Solo mueve la cámara: no ordena nada. */
  onVerEnMapa?: (movil: MovilCobertura) => void;
  seleccionado?: string | null;
}

function Chip({ texto, color }: { texto: string; color?: string }) {
  return (
    <span
      className="rounded-full border border-[color:var(--color-borde)] px-2 py-0.5 text-[11px] whitespace-nowrap"
      style={color ? { color, borderColor: color } : undefined}
    >
      {texto}
    </span>
  );
}

export default function PanelLocalidades({
  grupos,
  ahora,
  onVerEnMapa,
  seleccionado = null,
}: Props) {
  if (grupos.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-[color:var(--color-texto-tenue)]">
        No hay móviles en el alcance de esta sesión.
      </p>
    );
  }

  const reloj = ahora ?? 0;

  return (
    <ul className="flex flex-col gap-4">
      {grupos.map((g) => (
        <li key={g.localidad}>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-[color:var(--color-texto)]">
              {g.localidad}
            </h3>
            <span className="font-mono text-sm tabular-nums text-[color:var(--color-texto)]">
              {g.conteo.total}
            </span>
            <div className="flex flex-wrap gap-1">
              {g.conteo.tab > 0 && <Chip texto={`TAB ${g.conteo.tab}`} />}
              {g.conteo.tam > 0 && <Chip texto={`TAM ${g.conteo.tam}`} />}
              {g.conteo.sinTipo > 0 && <Chip texto={`sin tipo ${g.conteo.sinTipo}`} />}
              <Chip texto={`libres ${g.conteo.libres}`} color="#2ec4a6" />
              <Chip texto={`ocupados ${g.conteo.ocupados}`} color="#ff9f1c" />
              {g.conteo.ultimaConocida > 0 && (
                <Chip texto={`sin señal ${g.conteo.ultimaConocida}`} color="#8b9bb0" />
              )}
              {g.conteo.sinPosicion > 0 && (
                <Chip texto={`sin reporte ${g.conteo.sinPosicion}`} color="#8b9bb0" />
              )}
            </div>
          </div>

          <ul className="flex flex-col gap-1">
            {g.moviles.map((m) => {
              const segundos = antiguedadS(m.posicion?.reportadoEn, reloj);
              const frescura = frescuraDe(segundos);
              const color =
                frescura === "ultima-conocida" || frescura === "sin-reporte"
                  ? "#8b9bb0"
                  : m.disponible
                    ? "#2ec4a6"
                    : "#ff9f1c";

              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => m.posicion && onVerEnMapa?.(m)}
                    disabled={!m.posicion}
                    aria-label={`Ver ${m.id} en el mapa`}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors ${
                      seleccionado === m.id
                        ? "border-[color:var(--color-info)] bg-[color:var(--color-superficie-alta)]"
                        : "border-transparent hover:bg-[color:var(--color-superficie-alta)]"
                    } disabled:cursor-default disabled:opacity-70 disabled:hover:bg-transparent`}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="shrink-0 font-mono text-xs text-[color:var(--color-texto)]">
                      {m.id}
                    </span>
                    <span className="shrink-0 rounded border border-[color:var(--color-borde)] px-1 text-[10px] text-[color:var(--color-texto-tenue)]">
                      {/* Un tipo sin verificar NO se pinta como TAB ni TAM: es
                          filtro duro del ruteo, no una etiqueta cosmética. */}
                      {m.tipo ?? "tipo?"}
                    </span>
                    {/* `min-w-0` es obligatorio: sin él un hijo flex no se
                        encoge por debajo de su contenido y `truncate` no hace
                        nada — a 320 px la fila empujaría scroll horizontal. */}
                    <span className="ml-auto min-w-0 truncate text-right text-[11px] text-[color:var(--color-texto-tenue)]">
                      {m.posicion
                        ? `${textoAntiguedad(segundos)} · ${textoPrecision(m.posicion.precisionM)}`
                        : "sin reporte de posición"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
