"use client";

/**
 * Lo que ya se respondió, con su latencia.
 *
 * Se llama auditoría y no "historial" porque eso es lo que es: cada fila es
 * una declaración de capacidad fechada, y esa trazabilidad es lo que permite
 * defender el producto frente a la Ley 1751/2015. La latencia no está de
 * adorno — es el número que el pitch compara contra los 45 minutos de una
 * llamada telefónica.
 *
 * Los vencidos aparecen: una solicitud sin respuesta también es información
 * sobre la red, y esconderla dejaría el registro incompleto justo donde más
 * importa.
 */

import type { Handshake } from "@/lib/types";

const MARCA: Record<string, { icono: string; color: string; texto: string }> = {
  aceptado: { icono: "✓", color: "var(--color-estable)", texto: "Aceptado" },
  rechazado: { icono: "✕", color: "var(--color-alerta)", texto: "Sin capacidad" },
  timeout: { icono: "◷", color: "var(--color-texto-tenue)", texto: "Sin respuesta" },
};

export function HistorialAuditoria({
  handshakes,
  nombreSede,
}: {
  handshakes: Handshake[];
  nombreSede: (codigo: string) => string | undefined;
}) {
  if (handshakes.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-2">
        Auditoría · {handshakes.length}{" "}
        {handshakes.length === 1 ? "respuesta" : "respuestas"}
      </h2>

      <ul className="text-xs">
        {handshakes.map((h) => {
          const marca = MARCA[h.estado] ?? MARCA.timeout;
          return (
            <li
              key={h.id}
              className="flex items-center gap-2 py-2 border-b border-[color:var(--color-borde)]"
            >
              <span
                aria-hidden
                className="w-4 shrink-0 text-center font-bold"
                style={{ color: marca.color }}
              >
                {marca.icono}
              </span>

              <span className="flex-1 truncate">
                {nombreSede(h.sedeCodigo) ?? h.sedeCodigo}
              </span>

              <span className="text-[color:var(--color-texto-tenue)] truncate max-w-[38%]">
                {h.motivoRechazo ?? marca.texto}
              </span>

              {/* Sin respuesta no tiene latencia que mostrar: un guion dice
                  eso mejor que un cero, que se leería como "instantáneo". */}
              <span className="tabular w-12 text-right text-[color:var(--color-texto-tenue)]">
                {h.latenciaS !== null ? `${h.latenciaS}s` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
