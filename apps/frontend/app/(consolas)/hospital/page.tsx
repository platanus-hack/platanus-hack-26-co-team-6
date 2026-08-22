"use client";

/**
 * /hospital — CARRIL DE SEBAS
 *
 * La consola del jefe de urgencias. Dos botones. Nada más.
 *
 * Sirve tres propósitos:
 *   1. Es el fallback absoluto del demo: si se cae el wifi de los celulares,
 *      el handshake sigue funcionando desde aquí.
 *   2. Es la pantalla que se proyecta cuando se muestra el "otro lado".
 *   3. Es donde se ve el blindaje legal: en triage I no hay botón de rechazo.
 *
 * ⚠️ REGLA DE PRODUCTO QUE NO SE NEGOCIA:
 *    La Ley 1751 de 2015 obliga a atender urgencias sin autorización previa.
 *    "Rechazar" NO es un derecho a negar atención: es una DECLARACIÓN DE
 *    CAPACIDAD, queda auditada con timestamp, y en triage I ni siquiera se
 *    ofrece — escala directo al CRUE. Si alguien del jurado pregunta,
 *    esta pantalla es la respuesta.
 */

import { useEffect, useState } from "react";
import type { EstadoResponse } from "@/lib/types";
import { nombresServicios, ETIQUETA_TRIAGE, esHoraDorada } from "@/lib/presentacion";
import * as api from "@/lib/api";

const MOTIVOS = [
  "Sin camas UCI disponibles",
  "Sala de hemodinamia en procedimiento",
  "Urgencias en capacidad máxima",
  "Sin especialista de turno",
];

export default function Hospital() {
  const [estado, setEstado] = useState<EstadoResponse | null>(null);
  const [mostrandoMotivos, setMostrandoMotivos] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    // El catch mantiene vivo el polling si core parpadea: el siguiente tick
    // vuelve a intentar en vez de dejar la consola congelada.
    const cargar = async () => {
      const d = await api.estado().catch(() => null);
      if (d) setEstado(d);
    };
    cargar();
    const id = setInterval(cargar, 2000);
    return () => clearInterval(id);
  }, []);

  async function responder(
    handshakeId: string,
    decision: "aceptado" | "rechazado",
    motivo?: string
  ) {
    const r = await api.responder({ handshakeId, decision, motivo });
    setMostrandoMotivos(null);

    // La respuesta pudo no aplicarse: la solicitud vencía a los 45s y el caso
    // ya siguió a otra sede. Sin este aviso, tocar "Aceptar" no haría nada
    // visible salvo que la tarjeta se mueva de columna, y quien lo tocó se
    // quedaría preparando una cama para un paciente que no viene.
    setAviso(
      r.aplicada
        ? null
        : r.handshake.estado === "timeout"
          ? "Esta solicitud ya había vencido. PULSO la envió a otra sede."
          : `Esta solicitud ya estaba ${r.handshake.estado}.`,
    );

    setEstado(await api.estado());
  }

  const pendientes = estado?.handshakes.filter((h) => h.estado === "enviado") ?? [];
  const resueltos = estado?.handshakes.filter((h) => h.estado !== "enviado") ?? [];
  const caso = (id: string) => estado?.casos.find((c) => c.id === id);
  const sede = (cod: string) => estado?.congestion.find((c) => c.codigo === cod);

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-4">
      <header className="flex items-center gap-2 mb-6">
        <span className="text-2xl">🏥</span>
        <span className="font-bold text-lg">PULSO</span>
        <span className="text-xs text-[color:var(--color-texto-tenue)]">
            jefatura de urgencias
        </span>
        <span className="ml-auto text-xs text-[color:var(--color-texto-tenue)] latido">
          ● en vivo
        </span>
      </header>

      {aviso && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg flex items-start gap-2 text-sm
                     bg-[color:var(--color-alerta)]/15
                     border border-[color:var(--color-alerta)]/40"
        >
          <span aria-hidden>⏱</span>
          <span className="flex-1">{aviso}</span>
          <button
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 px-2 text-[color:var(--color-texto-tenue)]"
          >
            ✕
          </button>
        </div>
      )}

      {pendientes.length === 0 && (
        <div className="p-10 text-center text-[color:var(--color-texto-tenue)] rounded-xl border border-dashed border-[color:var(--color-borde)]">
          <p className="text-3xl mb-2">🕰</p>
          <p>Sin solicitudes pendientes.</p>
          <p className="text-xs mt-1">
            Abre <code>/campo</code> en otra pestaña y despacha un caso.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {pendientes.map((h) => {
          const c = caso(h.casoId);
          if (!c) return null;
          const critico = esHoraDorada(c.triage);
          const triageUno = c.triage === 1;

          return (
            <article
              key={h.id}
              className={`p-5 rounded-xl border ${
                critico
                  ? "border-[color:var(--color-critico)] bg-[color:var(--color-critico)]/10"
                  : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold">
                  {critico ? "🔴" : "🟡"} Triage {ETIQUETA_TRIAGE[c.triage]}
                </span>
                <span className="text-xs text-[color:var(--color-texto-tenue)]">
                  {sede(h.sedeCodigo)?.nombre}
                </span>
              </div>

              <p className="text-base mb-3">{c.resumen}</p>

              <dl className="text-xs space-y-1 text-[color:var(--color-texto-tenue)] mb-4">
                <div>
                  {c.edad ?? "?"} años ·{" "}
                  {c.sexo === "M" ? "masculino" : c.sexo === "F" ? "femenino" : "sexo no referido"}{" "}
                  · móvil {c.tipoMovil}
                </div>
                <div>
                  <span className="font-semibold">Dx probable:</span> {c.dxDescripcion}
                  {c.dxCie10 && ` (${c.dxCie10})`}
                </div>
                <div>
                  <span className="font-semibold">Requiere:</span>{" "}
                  {nombresServicios(c.serviciosRequeridos)}
                </div>
                {c.signosAlarma.length > 0 && (
                  <div className="text-[color:var(--color-alerta)]">
                    ⚠ {c.signosAlarma.join(" · ")}
                  </div>
                )}
              </dl>

              {mostrandoMotivos === h.id ? (
                <div className="space-y-2">
                  <p className="text-xs text-[color:var(--color-texto-tenue)]">
                    Motivo de la declaración de capacidad:
                  </p>
                  {MOTIVOS.map((m) => (
                    <button
                      key={m}
                      onClick={() => responder(h.id, "rechazado", m)}
                      className="w-full px-3 rounded-lg text-sm text-left
                                 bg-[color:var(--color-superficie-alta)]
                                 border border-[color:var(--color-borde)]"
                    >
                      {m}
                    </button>
                  ))}
                  <button
                    onClick={() => setMostrandoMotivos(null)}
                    className="w-full text-xs text-[color:var(--color-texto-tenue)]"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => responder(h.id, "aceptado")}
                    className="flex-[2] rounded-xl font-bold text-base
                               bg-[color:var(--color-estable)] text-[#04231d]"
                  >
                    ✅ Aceptar traslado
                  </button>
                  {/* Blindaje legal: en triage I no se ofrece rechazo. */}
                  {!triageUno && (
                    <button
                      onClick={() => setMostrandoMotivos(h.id)}
                      className="flex-1 rounded-xl font-semibold text-sm
                                 bg-[color:var(--color-superficie-alta)]
                                 border border-[color:var(--color-borde)]"
                    >
                      ⛔ Sin capacidad
                    </button>
                  )}
                </div>
              )}

              {triageUno && (
                <p className="mt-3 text-[11px] text-[color:var(--color-texto-tenue)] leading-relaxed">
                  Triage I. La Ley 1751/2015 obliga a la atención inicial de urgencias
                  sin autorización previa: esta solicitud no admite rechazo.
                  Si no hay capacidad real, escale al CRUE.
                </p>
              )}
            </article>
          );
        })}
      </div>

      {resueltos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-2">
            Historial · auditoría
          </h2>
          <ul className="text-xs space-y-1">
            {resueltos.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-2 py-1 border-b border-[color:var(--color-borde)]"
              >
                <span>{h.estado === "aceptado" ? "✅" : "⛔"}</span>
                <span className="flex-1 truncate">{sede(h.sedeCodigo)?.nombre}</span>
                {h.motivoRechazo && (
                  <span className="text-[color:var(--color-texto-tenue)] truncate max-w-[40%]">
                    {h.motivoRechazo}
                  </span>
                )}
                <span className="tabular text-[color:var(--color-texto-tenue)]">
                  {h.latenciaS}s
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
