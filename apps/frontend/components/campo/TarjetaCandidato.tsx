"use client";

/**
 * Una sede en el ranking.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  DOS DECISIONES DE DISEÑO QUE NO SON ESTÉTICAS
 * ═══════════════════════════════════════════════════════════════════
 *  1. EL #1 DOMINA. Antes todas las tarjetas pesaban casi igual y había que
 *     leer el número pequeño para saber cuál era la recomendada. En un
 *     celular, de pie, de noche, con guantes, eso no se lee: se adivina.
 *     Ahora la #1 es más grande, lleva sello y su ETA es el número más
 *     grande de la pantalla.
 *
 *  2. LA DESCARTADA TIENE QUE DOLER. Estaba en opacity-50, o sea invisible.
 *     Pero la tarjeta descartada es el mejor argumento del producto: ver
 *     "Clínica X · 4 min · ⛔ no tiene hemodinamia" es entender de un vistazo
 *     por qué el hospital más cercano puede ser el equivocado. Se pinta
 *     legible, con el ETA bien visible —para que se sienta lo cerca que
 *     estaba— y el motivo en rojo encima.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { Candidato } from "@/lib/types";

/** Umbrales de color de la barra de congestión. Espejan etiqueta() en core. */
function colorCongestion(c: number): string {
  if (c > 0.85) return "var(--color-critico)";
  if (c > 0.7) return "var(--color-alerta)";
  return "var(--color-estable)";
}

export function TarjetaCandidato({
  candidato: c,
  onDespachar,
}: {
  candidato: Candidato;
  onDespachar: (c: Candidato) => void;
}) {
  const descartada = c.motivoDescarte !== null;
  const primera = !descartada && c.rank === 1;

  if (descartada) return <TarjetaDescartada candidato={c} />;

  return (
    <article
      className={
        primera
          ? "p-5 rounded-2xl border-2 border-[color:var(--color-estable)] bg-[color:var(--color-superficie-alta)] shadow-lg shadow-[color:var(--color-estable)]/10"
          : "p-4 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
      }
    >
      {primera && (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--color-estable)]">
          ▸ Recomendado
        </p>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {!primera && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[color:var(--color-borde)]">
                #{c.rank}
              </span>
            )}
            <h3 className={primera ? "font-bold text-lg leading-tight" : "font-semibold truncate"}>
              {c.sede.nombre}
            </h3>
          </div>
          <p className="text-xs text-[color:var(--color-texto-tenue)] mt-0.5">
            {c.sede.localidad} · {c.distKm} km · complejidad {c.sede.complejidad}
          </p>
        </div>

        <div className="text-right shrink-0">
          <div className={`font-bold tabular ${primera ? "text-4xl" : "text-2xl"}`}>
            {Math.round(c.etaMin)}
          </div>
          <div className="text-[10px] text-[color:var(--color-texto-tenue)]">min ruta</div>
        </div>
      </div>

      {/* El desglose en minutos es el argumento del producto: que se vea. */}
      <div className="mt-3 flex gap-3 text-[11px] text-[color:var(--color-texto-tenue)] tabular">
        <span>ruta {Math.round(c.desglose.ruta)}′</span>
        <span>rechazo +{Math.round(c.desglose.riesgoRechazo)}′</span>
        <span>espera +{Math.round(c.desglose.espera)}′</span>
        <span className="ml-auto font-semibold text-[color:var(--color-texto)]">
          = {Math.round(c.score)}′
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="text-[color:var(--color-texto-tenue)]">congestión</span>
        <div className="flex-1 h-1.5 rounded-full bg-[color:var(--color-borde)] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${c.congestion * 100}%`,
              background: colorCongestion(c.congestion),
            }}
          />
        </div>
        <span className="tabular">{Math.round(c.pAceptacion * 100)}% acepta</span>
      </div>

      <button
        onClick={() => onDespachar(c)}
        className={`mt-3 w-full rounded-lg font-semibold bg-[color:var(--color-estable)] text-[#04231d] ${
          // 44px es el mínimo tocable con guantes. No lo bajes.
          primera ? "min-h-14 text-base" : "min-h-11 text-sm"
        }`}
      >
        Despachar aquí
      </button>
    </article>
  );
}

/**
 * Una sede que quedó fuera por el filtro duro.
 *
 * No lleva botón: no es una opción, es una explicación. Y por eso mismo
 * conserva el ETA grande — el punto es que se vea lo cerca que estaba.
 */
function TarjetaDescartada({ candidato: c }: { candidato: Candidato }) {
  return (
    <article className="p-4 rounded-xl border border-dashed border-[color:var(--color-critico)]/40 bg-[color:var(--color-critico)]/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate text-[color:var(--color-texto-tenue)]">
            {c.sede.nombre}
          </h3>
          <p className="text-xs text-[color:var(--color-texto-tenue)] mt-0.5">
            {c.sede.localidad} · {c.distKm} km
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold tabular text-[color:var(--color-texto-tenue)] line-through decoration-[color:var(--color-critico)]/70 decoration-2">
            {Math.round(c.etaMin)}
          </div>
          <div className="text-[10px] text-[color:var(--color-texto-tenue)]">min ruta</div>
        </div>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-[color:var(--color-critico)]">
        <span aria-hidden>⛔</span>
        <span>{c.motivoDescarte}</span>
      </p>
    </article>
  );
}
