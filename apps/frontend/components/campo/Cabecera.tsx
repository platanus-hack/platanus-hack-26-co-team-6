"use client";

/**
 * Cabecera de /campo: identidad, ubicación de la unidad y cronómetro.
 *
 * El cronómetro es EL NÚMERO DEL PITCH — del dictado a la cama confirmada.
 * Pasa a rojo a los 90 segundos porque esa es la promesa que hace la landing.
 *
 * La línea de ubicación existe para que nadie descubra en tarima que estuvo
 * ruteando desde el punto de demo sin darse cuenta.
 */

import { MENSAJE_GEO, type EstadoGeo } from "@/lib/useGeolocalizacion";

const LIMITE_PROMESA_S = 90;

export function Cabecera({
  transcurrido,
  corriendo,
  estadoGeo,
  precisionM,
  onReubicar,
}: {
  transcurrido: number;
  corriendo: boolean;
  estadoGeo: EstadoGeo;
  precisionM: number | null;
  onReubicar: () => void;
}) {
  return (
    <header className="mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🫀
          </span>
          <span className="font-bold text-lg">PULSO</span>
          <span className="text-xs text-[color:var(--color-texto-tenue)]">campo</span>
        </div>

        {corriendo && (
          <div className="text-right tabular">
            <div
              className={`text-2xl font-bold ${
                transcurrido > LIMITE_PROMESA_S ? "text-[color:var(--color-critico)]" : ""
              }`}
            >
              {transcurrido.toFixed(1)}s
            </div>
            <div className="text-[10px] text-[color:var(--color-texto-tenue)] uppercase tracking-wide">
              hora dorada
            </div>
          </div>
        )}
      </div>

      <IndicadorUbicacion
        estado={estadoGeo}
        precisionM={precisionM}
        onReubicar={onReubicar}
      />
    </header>
  );
}

function IndicadorUbicacion({
  estado,
  precisionM,
  onReubicar,
}: {
  estado: EstadoGeo;
  precisionM: number | null;
  onReubicar: () => void;
}) {
  const ubicado = estado === "ok";
  const buscando = estado === "pidiendo";

  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[color:var(--color-texto-tenue)]">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${buscando ? "latido" : ""}`}
        style={{
          background: ubicado
            ? "var(--color-estable)"
            : buscando
              ? "var(--color-info)"
              : "var(--color-alerta)",
        }}
        aria-hidden
      />
      <span>
        {MENSAJE_GEO[estado]}
        {ubicado && precisionM !== null && ` · ±${precisionM} m`}
      </span>

      {/* Sin ubicación se puede reintentar: en una ambulancia el GPS engancha
          tarde, y obligar a recargar la página en movimiento es absurdo. */}
      {!ubicado && !buscando && (
        <button
          onClick={onReubicar}
          className="ml-auto shrink-0 underline underline-offset-2"
        >
          reintentar
        </button>
      )}
    </p>
  );
}
