"use client";

/**
 * En qué modo está corriendo el sistema.
 *
 * Lee `GET /capacidades` para que la barra de /campo pueda decir si el ETA
 * viene de Mapbox con tráfico o de dividir kilómetros entre 22, y si el
 * triage lo hace un modelo o una tabla de palabras clave.
 *
 * Sin esto la degradación es invisible: la consola pinta "8 min" con la misma
 * tipografía en los dos casos, y el paramédico no tiene forma de saber si
 * puede confiar en el minuto exacto o solo en el orden de la lista.
 *
 * Se pide UNA vez al montar. Las capacidades dependen de qué credenciales
 * tenía core al arrancar, así que no cambian mientras el turno dura; volver a
 * preguntarlas cada pocos segundos sería gastar batería para leer lo mismo.
 * Quien quiera refrescarlas tras una reconexión llama a `recargar`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Capacidades } from "./types";
import * as api from "./api";

export function useCapacidades() {
  const [capacidades, setCapacidades] = useState<Capacidades | null>(null);
  const vivoRef = useRef(true);

  const recargar = useCallback(async () => {
    // Un fallo aquí NO es un error que mostrar: significa que core no está
    // disponible, y de eso ya informa el indicador de conexión. Duplicarlo con
    // un banner rojo sería ruido sobre una pantalla que se usa con prisa.
    const c = await api.capacidades().catch(() => null);
    if (vivoRef.current && c) setCapacidades(c);
  }, []);

  useEffect(() => {
    vivoRef.current = true;
    void recargar();
    return () => {
      vivoRef.current = false;
    };
  }, [recargar]);

  return { capacidades, recargar };
}
