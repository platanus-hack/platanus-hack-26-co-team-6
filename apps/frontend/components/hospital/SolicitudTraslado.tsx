"use client";

/**
 * Una solicitud de traslado esperando respuesta.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  EL PLAZO ES LA TARJETA
 * ═══════════════════════════════════════════════════════════════════
 *  La solicitud vence a los 45 segundos y entonces PULSO la manda a otra
 *  sede. Hasta ahora la pantalla no lo decía: el jefe de urgencias tocaba
 *  "Aceptar" y recibía un "esto ya había vencido" — una disculpa después del
 *  hecho por una cuenta que nunca vio.
 *
 *  Así que el plazo no es un adorno dentro de la tarjeta: es su borde
 *  superior, que se vacía de derecha a izquierda. La tarjeta ENTERA es la
 *  solicitud, y lo que se agota es la solicitud, no un accesorio suyo. Se lee
 *  desde el otro lado de la sala, que es donde suele estar esta pantalla.
 *
 *  El color sigue el semáforo clínico que ya usa el resto del producto:
 *  estable → alerta a los 20 s → crítico a los 10 s. Ver useCuentaAtras.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { CasoPublico, Handshake } from "@/lib/types";
import { ETIQUETA_TRIAGE, esHoraDorada, nombresServicios } from "@/lib/presentacion";
import { colorRestante, UMBRAL_CRITICO_S, useCuentaAtras } from "@/lib/useCuentaAtras";
import { MotivosCapacidad } from "./MotivosCapacidad";

export function SolicitudTraslado({
  handshake,
  caso,
  sede,
  eligiendoMotivo,
  onAceptar,
  onPedirMotivo,
  onRechazar,
  onCancelarMotivo,
}: {
  handshake: Handshake;
  caso: CasoPublico;
  sede: string | undefined;
  eligiendoMotivo: boolean;
  onAceptar: () => void;
  onPedirMotivo: () => void;
  /** codigo del catálogo + etiqueta que se vio al tocarlo. */
  onRechazar: (codigo: string, etiqueta: string) => void;
  onCancelarMotivo: () => void;
}) {
  const { restanteS, fraccion, vencida } = useCuentaAtras(
    handshake.enviadoEn,
    handshake.expiraEn,
  );

  const critico = esHoraDorada(caso.triage);
  const triageUno = caso.triage === 1;
  const color = colorRestante(restanteS);
  const porVencer = restanteS <= UMBRAL_CRITICO_S && !vencida;

  return (
    <article
      className={`relative overflow-hidden rounded-xl border ${
        vencida
          ? "border-[color:var(--color-borde)] bg-transparent"
          : critico
            ? "border-[color:var(--color-critico)] bg-[color:var(--color-critico)]/10"
            : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
      }`}
    >
      {/* El plazo, en el borde. Sin transición: la barra ya se mueve cuatro
          veces por segundo y una transición encima la haría ir atrasada. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={45}
        aria-valuenow={restanteS}
        aria-label="Segundos para responder"
        className="absolute inset-x-0 top-0 h-1"
        style={{
          width: `${fraccion * 100}%`,
          background: color,
          opacity: vencida ? 0 : 1,
        }}
      />

      <div className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-sm font-bold">
            {critico ? "🔴" : "🟡"} Triage {ETIQUETA_TRIAGE[caso.triage]}
          </span>

          {vencida ? (
            <span className="text-xs text-[color:var(--color-texto-tenue)]">
              Venció · re-ruteando
            </span>
          ) : (
            <span
              className={`tabular text-sm font-bold ${porVencer ? "latido" : ""}`}
              style={{ color }}
            >
              {restanteS}s
            </span>
          )}
        </div>

        <p className="text-base mb-3">{caso.resumen}</p>

        <dl className="text-xs space-y-1 text-[color:var(--color-texto-tenue)] mb-4">
          <div>
            {caso.edad ?? "?"} años ·{" "}
            {caso.sexo === "M"
              ? "masculino"
              : caso.sexo === "F"
                ? "femenino"
                : "sexo no referido"}{" "}
            · móvil {caso.tipoMovil}
          </div>
          <div>
            <span className="font-semibold">Dx probable:</span> {caso.dxDescripcion}
            {caso.dxCie10 && ` (${caso.dxCie10})`}
          </div>
          <div>
            <span className="font-semibold">Requiere:</span>{" "}
            {caso.serviciosRequeridos.length
              ? nombresServicios(caso.serviciosRequeridos)
              : "solo urgencias"}
          </div>
          {caso.signosAlarma.length > 0 && (
            <div className="text-[color:var(--color-alerta)]">
              ⚠ {caso.signosAlarma.join(" · ")}
            </div>
          )}
          {sede && (
            <div>
              <span className="font-semibold">Solicitada a:</span> {sede}
            </div>
          )}
        </dl>

        {vencida ? (
          <p className="text-xs text-[color:var(--color-texto-tenue)]">
            Sin respuesta en 45 segundos. PULSO ya la envió a la siguiente sede
            del ranking.
          </p>
        ) : eligiendoMotivo ? (
          <MotivosCapacidad onElegir={onRechazar} onCancelar={onCancelarMotivo} />
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onAceptar}
              className="flex-[2] rounded-xl font-bold text-base
                         bg-[color:var(--color-estable)] text-[#04231d]"
            >
              Aceptar traslado
            </button>

            {/* Blindaje legal: en triage I no se ofrece rechazo. */}
            {!triageUno && (
              <button
                onClick={onPedirMotivo}
                className="flex-1 rounded-xl font-semibold text-sm
                           bg-[color:var(--color-superficie-alta)]
                           border border-[color:var(--color-borde)]"
              >
                Sin capacidad
              </button>
            )}
          </div>
        )}

        {triageUno && !vencida && (
          <p className="mt-3 text-[11px] text-[color:var(--color-texto-tenue)] leading-relaxed">
            Triage I. La Ley 1751/2015 obliga a la atención inicial de urgencias
            sin autorización previa: esta solicitud no admite rechazo. Si no hay
            capacidad real, escale al CRUE por radio.
          </p>
        )}
      </div>
    </article>
  );
}
