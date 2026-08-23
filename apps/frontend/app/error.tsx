"use client";

/**
 * El límite de error de las consolas.
 *
 * Next exige que sea cliente: recibe un `reset()` que vuelve a montar el
 * subárbol sin recargar la página. Eso importa aquí más que en una web
 * normal — recargar `/campo` a mitad de un traslado pierde el dictado que el
 * paramédico tenga a medias.
 *
 * ── QUÉ SE MUESTRA Y QUÉ NO ────────────────────────────────────────
 * `error.message` NO se pinta. En producción Next ya lo reemplaza por un
 * texto genérico, pero en desarrollo llega entero, y un error lanzado desde
 * una vista de caso puede arrastrar dictado, diagnóstico o coordenadas en el
 * mensaje. La regla 5 del repo no tiene una excepción para las pantallas de
 * error. Se muestra el `digest`, que es un hash con el que se encuentra la
 * traza en el servidor sin que el dato viaje.
 *
 * Y se dice lo que hay que hacer mientras tanto: seguir por radio con el
 * CRUE. Un traslado no se detiene porque una pantalla se caiga.
 */

import { useEffect } from "react";
import { Rescate, Salidas } from "@/components/Salidas";

export default function ErrorConsola({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A la consola del navegador, que es local. No se manda a ningún sitio:
    // no hay colector todavía (tarea 5.3) y mandarlo a ciegas sería sacar el
    // mensaje del dispositivo sin saber qué lleva dentro.
    console.error("[pulso] error de render", error);
  }, [error]);

  return (
    <Rescate titulo="Esta pantalla se cayó">
      <p className="mb-4 text-xs text-[color:var(--color-texto-tenue)]">
        El resto del sistema sigue en pie. Si estás en mitad de un traslado,
        sigue por radio con el CRUE mientras vuelves a entrar.
      </p>

      <button
        type="button"
        onClick={reset}
        className="mb-5 inline-flex min-h-14 w-full items-center justify-center rounded-md bg-[color:var(--color-marca)] px-4 font-semibold text-white"
      >
        Reintentar
      </button>

      <Salidas />

      {error.digest && (
        <p className="mt-5 text-[11px] text-[color:var(--color-texto-tenue)]">
          Referencia para soporte: <code>{error.digest}</code>
        </p>
      )}
    </Rescate>
  );
}
