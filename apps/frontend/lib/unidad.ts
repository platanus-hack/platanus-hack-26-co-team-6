"use client";

/**
 * Qué móvil es este.
 *
 * ── POR QUÉ VIVE EN EL CLIENTE ────────────────────────────────────
 * core autentica con UNA contraseña compartida por turno: no hay usuarios, no
 * hay móviles registrados, no hay a quién preguntarle "¿quién eres?". Montar
 * eso de verdad es media jornada de backend y una tabla de usuarios que nadie
 * va a administrar durante el hackathon.
 *
 * Lo que sí resuelve un problema real hoy es que el regulador del CRUE vea
 * QUÉ ambulancia está preguntando, en vez de una lista de casos anónimos. Eso
 * se consigue declarando el móvil una vez en el dispositivo y mandándolo
 * pegado al caso.
 *
 * ⚠️ NO ES AUTENTICACIÓN, y no debe usarse como tal. Quien tenga la contraseña
 *    del turno puede escribir el identificador que quiera. Es trazabilidad
 *    operativa —el equivalente a decir tu indicativo por radio—, no una
 *    credencial. Si algún día hay que confiar en este dato para autorizar
 *    algo, el lugar de arreglarlo es core, no este archivo.
 *
 * El tablet de una ambulancia no cambia de móvil todos los días, así que
 * localStorage es el almacenamiento correcto: sobrevive al cierre de la app y
 * no viaja a ningún servidor.
 */

import { useCallback, useSyncExternalStore } from "react";
import type { Unidad } from "./types";

const CLAVE = "pulso.unidad";

/** Formato esperado del identificador. Ver `normalizarId`. */
export const EJEMPLO_ID = "AMB-014";

/**
 * Deja el identificador en la forma que el CRUE espera leer.
 *
 * Mayúsculas y sin espacios porque el mismo móvil escrito "amb 14", "AMB-14" y
 * "Amb-014" son tres filas distintas en el tablero del regulador, y nadie las
 * va a reconciliar a las 3 de la mañana.
 */
export function normalizarId(crudo: string): string {
  return crudo.trim().toUpperCase().replace(/\s+/g, "-").slice(0, 24);
}

function crudo(): string | null {
  // localStorage lanza en modo privado de algunos navegadores y en iframes con
  // cookies bloqueadas. Un móvil sin declarar no puede tumbar la consola.
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

/**
 * Último string leído y el objeto que salió de él.
 *
 * `useSyncExternalStore` compara los snapshots por identidad y vuelve a
 * renderizar si cambian. Parsear el JSON en cada lectura devolvería un objeto
 * nuevo cada vez —distinto por identidad aunque sea igual por contenido— y
 * React entraría en un bucle de renders. Por eso se cachea contra el string.
 */
let ultimoCrudo: string | null = null;
let ultimaUnidad: Unidad | null = null;

function leer(): Unidad | null {
  const s = crudo();
  if (s === ultimoCrudo) return ultimaUnidad;

  ultimoCrudo = s;
  try {
    const u = s ? (JSON.parse(s) as Unidad) : null;
    ultimaUnidad = typeof u?.id === "string" && u.id.length > 0 ? u : null;
  } catch {
    ultimaUnidad = null;
  }
  return ultimaUnidad;
}

/** En el servidor no hay móvil declarado. Ver el comentario de `useUnidad`. */
function leerEnServidor(): Unidad | null {
  return null;
}

const oyentes = new Set<() => void>();

function suscribir(fn: () => void): () => void {
  oyentes.add(fn);
  // El evento 'storage' solo lo disparan las OTRAS pestañas, así que las
  // escrituras propias se avisan a mano en `escribir`.
  window.addEventListener("storage", fn);
  return () => {
    oyentes.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

function escribir(u: Unidad | null): void {
  try {
    if (u) window.localStorage.setItem(CLAVE, JSON.stringify(u));
    else window.localStorage.removeItem(CLAVE);
  } catch {
    // Sin persistencia la unidad dura lo que la pestaña. Degradar en silencio
    // es correcto aquí: el caso se puede atender igual sin declarar el móvil.
  }
  oyentes.forEach((fn) => fn());
}

/**
 * La unidad declarada en este dispositivo.
 *
 * `useSyncExternalStore` y no `useState` + efecto: `localStorage` no existe
 * durante el prerender, así que el tercer argumento (`leerEnServidor`) le da a
 * React el valor a usar en el servidor —`null`— y React se encarga de releer
 * en el cliente sin que el HTML servido y el hidratado difieran. Es la
 * herramienta hecha para leer un almacén externo, y de paso el suscriptor al
 * evento `storage` mantiene sincronizadas dos pestañas abiertas en el mismo
 * tablet.
 */
export function useUnidad() {
  const unidad = useSyncExternalStore(suscribir, leer, leerEnServidor);

  const declarar = useCallback((id: string, tripulante?: string) => {
    const limpio = normalizarId(id);
    if (!limpio) return;
    escribir(
      tripulante?.trim()
        ? { id: limpio, tripulante: tripulante.trim() }
        : { id: limpio },
    );
  }, []);

  const olvidar = useCallback(() => escribir(null), []);

  return { unidad, declarar, olvidar };
}
