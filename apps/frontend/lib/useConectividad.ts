"use client";

/**
 * ¿Está vivo lo que estoy viendo?
 *
 * Es el indicador más importante del módulo de campo. En una ambulancia en
 * movimiento la señal se cae cada pocos minutos, y el paramédico tiene que
 * saber si el ranking que tiene en pantalla está vivo o congelado desde hace
 * dos túneles.
 *
 * ── POR QUÉ NO BASTA navigator.onLine ─────────────────────────────
 * `navigator.onLine` responde "¿hay una interfaz de red levantada?", no "¿hay
 * internet?". Dice `true` conectado al wifi de un evento que no enruta a
 * ninguna parte, y eso es exactamente lo que pasa en un auditorio lleno. Por
 * eso la señal que manda es el ping a `/health` de core; `onLine` solo se usa
 * para reaccionar al instante cuando el sistema operativo SÍ sabe que se cayó.
 *
 * `/health` es la única ruta pública de core y no toca la sesión, así que este
 * latido no puede expulsar a nadie del turno por un 401.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";

export type EstadoConexion = "en-linea" | "sin-senal" | "verificando";

/**
 * Cada cuánto se comprueba core.
 *
 * 10s es el equilibrio: suficientemente vivo para que el paramédico no tome
 * una decisión sobre datos de hace un minuto, suficientemente espaciado para
 * no gastar batería ni datos en una zona con cobertura mala.
 */
const LATIDO_MS = 10_000;

export const MENSAJE_CONEXION: Record<EstadoConexion, string> = {
  "en-linea": "En línea",
  "sin-senal": "Sin señal",
  verificando: "Verificando…",
};

export function useConectividad() {
  const [estado, setEstado] = useState<EstadoConexion>("verificando");
  /** Última vez que core respondió. Es lo que dice si lo visto sigue fresco. */
  const [ultimoContacto, setUltimoContacto] = useState<number | null>(null);
  const vivoRef = useRef(true);

  const comprobar = useCallback(async () => {
    // Si el sistema operativo ya sabe que no hay red, ahorramos el fetch: el
    // resultado es seguro y así el indicador cambia al instante en vez de
    // esperar a que el fetch agote su tiempo.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (vivoRef.current) setEstado("sin-senal");
      return;
    }

    const ok = await api.vivo();
    if (!vivoRef.current) return;

    setEstado(ok ? "en-linea" : "sin-senal");
    if (ok) setUltimoContacto(Date.now());
  }, []);

  useEffect(() => {
    vivoRef.current = true;

    // En un microtask y no directo: `comprobar` puede resolver de forma
    // síncrona cuando el navegador ya sabe que no hay red, y un setState
    // síncrono dentro de un efecto encadena un render extra en cada montaje.
    // Mismo patrón —y misma razón— que en useGeolocalizacion.
    queueMicrotask(() => void comprobar());

    const id = setInterval(() => void comprobar(), LATIDO_MS);
    // Los eventos del navegador no sustituyen al latido —mienten sobre si hay
    // internet— pero sí dan la reacción inmediata cuando el móvil cambia de
    // celda o vuelve de un túnel.
    const alVolver = () => void comprobar();
    const alCaer = () => setEstado("sin-senal");
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alCaer);

    return () => {
      vivoRef.current = false;
      clearInterval(id);
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alCaer);
    };
  }, [comprobar]);

  return { estado, ultimoContacto, comprobar };
}
