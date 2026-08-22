/**
 * Almacen en memoria.
 *
 * Existe para que TODO el flujo corra sin Supabase configurado. En el
 * momento en que Zaid tenga la DB lista, `db.ts` empieza a leer de alla y
 * esto queda solo como fallback de desarrollo.
 *
 * Limitacion conocida: el estado se pierde al reiniciar el dev server y no
 * se comparte entre instancias serverless en Vercel. Para el demo eso da
 * igual (una sola sesion, un solo proceso). No lo "arreglen": si necesitan
 * persistencia real, es porque ya deberian estar usando Supabase.
 */

import type { Caso, Handshake } from "./types";

type G = typeof globalThis & {
  __pulso?: {
    casos: Map<string, Caso>;
    handshakes: Map<string, Handshake>;
    /** sedeCodigo → { aceptados, rechazados } — alimenta P(aceptacion) */
    historial: Map<string, { aceptados: number; rechazados: number }>;
    /** sedeCodigo → timestamps ISO de rechazos, para la ventana de 6h */
    rechazosRecientes: Map<string, string[]>;
  };
};

// Se cuelga de globalThis para sobrevivir el hot-reload de Next en dev.
const g = globalThis as G;
if (!g.__pulso) {
  g.__pulso = {
    casos: new Map(),
    handshakes: new Map(),
    historial: new Map(),
    rechazosRecientes: new Map(),
  };
}

export const almacen = g.__pulso!;

// ── Casos ────────────────────────────────────────────────────────

export function guardarCaso(caso: Caso): Caso {
  almacen.casos.set(caso.id, caso);
  return caso;
}

export function obtenerCaso(id: string): Caso | undefined {
  return almacen.casos.get(id);
}

export function listarCasos(): Caso[] {
  return [...almacen.casos.values()].sort((a, b) =>
    b.creadoEn.localeCompare(a.creadoEn)
  );
}

// ── Handshakes ───────────────────────────────────────────────────

export function guardarHandshake(h: Handshake): Handshake {
  almacen.handshakes.set(h.id, h);
  return h;
}

export function obtenerHandshake(id: string): Handshake | undefined {
  return almacen.handshakes.get(id);
}

export function listarHandshakes(casoId?: string): Handshake[] {
  const todos = [...almacen.handshakes.values()];
  const filtrados = casoId ? todos.filter((h) => h.casoId === casoId) : todos;
  return filtrados.sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn));
}

/** Handshakes que siguen esperando respuesta. Los pinta la consola del hospital. */
export function handshakesPendientes(): Handshake[] {
  return listarHandshakes().filter((h) => h.estado === "enviado");
}

// ── Historial de aceptacion — el dataset que se auto-etiqueta ────

/**
 * ⭐ Aqui esta el corazon del producto: cada respuesta de un hospital
 * queda registrada y se convierte en el prior de la siguiente decision.
 * Nadie tipeo nada. El rechazo ES el sensor.
 */
export function registrarRespuesta(
  sedeCodigo: string,
  decision: "aceptado" | "rechazado"
): void {
  const h = almacen.historial.get(sedeCodigo) ?? { aceptados: 0, rechazados: 0 };
  if (decision === "aceptado") h.aceptados += 1;
  else h.rechazados += 1;
  almacen.historial.set(sedeCodigo, h);

  if (decision === "rechazado") {
    const lista = almacen.rechazosRecientes.get(sedeCodigo) ?? [];
    lista.push(new Date().toISOString());
    almacen.rechazosRecientes.set(sedeCodigo, lista);
  }
}

export function historialSede(sedeCodigo: string): {
  aceptados: number;
  rechazados: number;
} {
  return almacen.historial.get(sedeCodigo) ?? { aceptados: 0, rechazados: 0 };
}

/** Cuantos rechazos acumula esta sede en las ultimas `horas`. */
export function rechazosEnVentana(sedeCodigo: string, horas = 6): number {
  const lista = almacen.rechazosRecientes.get(sedeCodigo) ?? [];
  const corte = Date.now() - horas * 3600_000;
  return lista.filter((iso) => new Date(iso).getTime() >= corte).length;
}

/** Solo para el demo: dejar todo limpio antes de subir al escenario. */
export function reiniciarTodo(): void {
  almacen.casos.clear();
  almacen.handshakes.clear();
  almacen.historial.clear();
  almacen.rechazosRecientes.clear();
}
