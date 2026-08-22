"use client";

/**
 * /crue — tablero del Centro Regulador de Urgencias y Emergencias.
 *
 * Pantalla de soporte, no protagonista del demo. Pero vale oro en las
 * preguntas del jurado: demuestra que PULSO no reemplaza al CRUE (Res.
 * 1220/2010 le da la potestad regulatoria y legalmente no se puede quitar).
 * PULSO propone; el CRUE regula.
 *
 * Además es donde se VE que la red aprende: la tabla de congestión muestra
 * cómo cada rechazo mueve el índice de una sede, sin que nadie reporte nada.
 *
 * Dueño: Zaid (es la vitrina natural de la capa de datos).
 */

import { useEffect, useState } from "react";
import type { CasoPublico, CongestionSede, Handshake } from "@/lib/types";
import { ETIQUETA_TRIAGE } from "@/lib/presentacion";
import * as api from "@/lib/api";

export default function Crue() {
  // CasoPublico, no Caso: /estado ya no manda el dictado crudo ni las
  // coordenadas del paciente. El tablero nunca los pintó.
  const [casos, setCasos] = useState<CasoPublico[]>([]);
  const [handshakes, setHandshakes] = useState<Handshake[]>([]);
  const [congestion, setCongestion] = useState<CongestionSede[]>([]);

  useEffect(() => {
    // Tablero de sala: si core parpadea, el siguiente tick lo recupera solo.
    const cargar = async () => {
      const d = await api.estado().catch(() => null);
      if (!d) return;
      setCasos(d.casos);
      setHandshakes(d.handshakes);
      setCongestion([...d.congestion].sort((a, b) => b.indice - a.indice));
    };
    cargar();
    const id = setInterval(cargar, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen max-w-5xl mx-auto p-4">
      <header className="flex items-center gap-2 mb-6">
        <span className="text-2xl">📡</span>
        <span className="font-bold text-lg">PULSO</span>
        <span className="text-xs text-[color:var(--color-texto-tenue)]">
          CRUE · regulación
        </span>
        <span className="ml-auto text-xs text-[color:var(--color-texto-tenue)] latido">
          ● en vivo
        </span>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-2">
            Casos activos ({casos.length})
          </h2>
          <div className="space-y-2">
            {casos.length === 0 && (
              <p className="text-sm text-[color:var(--color-texto-tenue)]">
                Sin casos. Despacha uno desde <code>/campo</code>.
              </p>
            )}
            {casos.map((c) => {
              const hs = handshakes.filter((h) => h.casoId === c.id);
              const aceptado = hs.find((h) => h.estado === "aceptado");
              return (
                <article
                  key={c.id}
                  className="p-3 rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold">
                      {c.triage <= 2 ? "🔴" : "🟡"} {ETIQUETA_TRIAGE[c.triage]}
                    </span>
                    <span className="text-[color:var(--color-texto-tenue)]">
                      {aceptado
                        ? `✅ ubicado en ${aceptado.latenciaS}s`
                        : `${hs.length} intento(s)`}
                    </span>
                  </div>
                  <p className="text-sm">{c.resumen}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-2">
            Congestión de la red · inferida
          </h2>
          <p className="text-[11px] text-[color:var(--color-texto-tenue)] mb-3 leading-relaxed">
            Ninguna IPS reportó estos números. Salen del snapshot estructural del
            REPS, la curva horaria de demanda, y sobre todo de los rechazos
            registrados: cada rechazo es una observación etiquetada.
          </p>
          <table className="w-full text-xs">
            <thead className="text-[color:var(--color-texto-tenue)]">
              <tr className="text-left">
                <th className="pb-2 font-normal">Sede</th>
                <th className="pb-2 font-normal w-24">Índice</th>
                <th className="pb-2 font-normal w-16 text-right">✅ / ⛔</th>
              </tr>
            </thead>
            <tbody>
              {congestion.slice(0, 14).map((s) => (
                <tr key={s.codigo} className="border-t border-[color:var(--color-borde)]">
                  <td className="py-2 pr-2 truncate max-w-[180px]">{s.nombre}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-[color:var(--color-borde)] overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${s.indice * 100}%`,
                            background:
                              s.indice > 0.85
                                ? "var(--color-critico)"
                                : s.indice > 0.7
                                  ? "var(--color-alerta)"
                                  : "var(--color-estable)",
                          }}
                        />
                      </div>
                      <span className="tabular w-8 text-right">
                        {Math.round(s.indice * 100)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular text-[color:var(--color-texto-tenue)]">
                    {s.aceptados}/{s.rechazados}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
