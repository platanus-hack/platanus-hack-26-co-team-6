"use client";

/**
 * Lo que esta pantalla NO puede afirmar.
 *
 * La regla 2 del repo —todo degrada y lo dice— en una pantalla de pared no
 * puede ser una nota al pie. Si el hospital cree que el reloj sigue al móvil y
 * en realidad es el ETA que se calculó al despachar hace ocho minutos, prepara
 * la sala tarde y nadie se entera de por qué.
 *
 * Formato: los huecos que cambian lo que la pantalla AFIRMA (`critico`) van
 * visibles siempre, en una línea cada uno. Los que solo la empeoran (`aviso`)
 * se cuentan y se despliegan a un toque. Un tablero donde todo grita es un
 * tablero que nadie mira — la misma jerarquía de la barra de `/campo`.
 */

import { TriangleAlert } from "lucide-react";
import type { HuecoDeclarado } from "@/lib/recepcion-modelo";

export function HuecosDeclarados({ huecos }: { huecos: HuecoDeclarado[] }) {
  if (huecos.length === 0) return null;

  const criticos = huecos.filter((h) => h.nivel === "critico");
  const avisos = huecos.filter((h) => h.nivel === "aviso");

  return (
    <section
      aria-label="Degradaciones declaradas"
      className="rounded-2xl border border-[color:var(--color-alerta)]/40 bg-[color:var(--color-alerta)]/10 p-4"
    >
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--color-alerta)]">
        <TriangleAlert className="size-4 shrink-0" strokeWidth={2.4} />
        Lo que esta pantalla no puede afirmar
      </h2>

      <ul className="mt-2 space-y-1.5">
        {criticos.map((h) => (
          <li key={h.id} className="text-sm leading-snug">
            <strong className="font-semibold">{h.titulo}.</strong>{" "}
            <span className="text-[color:var(--color-texto-tenue)]">
              {h.detalle}
            </span>
          </li>
        ))}
      </ul>

      {avisos.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-alerta)]">
            {avisos.length} aviso{avisos.length === 1 ? "" : "s"} más
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {avisos.map((h) => (
              <li key={h.id} className="text-sm leading-snug">
                <strong className="font-semibold">{h.titulo}.</strong>{" "}
                <span className="text-[color:var(--color-texto-tenue)]">
                  {h.detalle}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
