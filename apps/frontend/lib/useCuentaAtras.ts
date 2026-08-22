"use client";

/**
 * Segundos que le quedan a una solicitud antes de vencer.
 *
 * Cuenta contra el `expiraEn` que selló el servidor, nunca contra un plazo
 * calculado aquí. Es la razón por la que ese campo viaja en el contrato: si el
 * cliente inventara los 45 segundos, la barra llegaría a cero mientras core
 * sigue esperando —o al revés— y la pantalla mentiría sobre lo único que esta
 * consola tiene que decir bien.
 *
 * Tick de 250 ms: suficiente para que el número no se sienta trabado y lo
 * bastante lento para no repintar de más con varias tarjetas abiertas.
 */

import { useEffect, useState } from "react";

const TICK_MS = 250;

export interface CuentaAtras {
  /** Segundos restantes, nunca negativo. */
  restanteS: number;
  /** 1 recién enviada, 0 vencida. Es lo que dibuja la barra. */
  fraccion: number;
  vencida: boolean;
}

function calcular(enviadoEn: string, expiraEn: string): CuentaAtras {
  const inicio = new Date(enviadoEn).getTime();
  const fin = new Date(expiraEn).getTime();
  const ahora = Date.now();

  const total = Math.max(1, fin - inicio);
  const restante = Math.max(0, fin - ahora);

  return {
    restanteS: Math.ceil(restante / 1000),
    fraccion: Math.min(1, restante / total),
    vencida: restante <= 0,
  };
}

export function useCuentaAtras(
  enviadoEn: string,
  expiraEn: string,
  activa = true,
): CuentaAtras {
  const [valor, setValor] = useState<CuentaAtras>(() =>
    calcular(enviadoEn, expiraEn),
  );

  useEffect(() => {
    if (!activa) return;

    // No se recalcula aquí: el inicializador perezoso de useState ya lo hizo
    // al montar, y si las fechas cambiaran el primer tick lo corrige en 250 ms
    // —invisible—. Un setState síncrono dentro del efecto encadenaría un
    // render extra por cada tarjeta en pantalla.
    const id = setInterval(() => {
      const siguiente = calcular(enviadoEn, expiraEn);
      setValor(siguiente);
      if (siguiente.vencida) clearInterval(id);
    }, TICK_MS);

    return () => clearInterval(id);
  }, [enviadoEn, expiraEn, activa]);

  return valor;
}

/**
 * Umbrales del semáforo, en segundos restantes.
 *
 * No son estéticos: a 20 segundos todavía se puede leer el caso y decidir; a
 * 10 ya solo alcanza para tocar el botón. Por eso el color cambia ahí.
 */
export const UMBRAL_ALERTA_S = 20;
export const UMBRAL_CRITICO_S = 10;

export function colorRestante(restanteS: number): string {
  if (restanteS <= UMBRAL_CRITICO_S) return "var(--color-critico)";
  if (restanteS <= UMBRAL_ALERTA_S) return "var(--color-alerta)";
  return "var(--color-estable)";
}
